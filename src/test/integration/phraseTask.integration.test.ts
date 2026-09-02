import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { bundledBinaryName } from '../../utils/bundledBinary';
import { DAY_NAMES_SHORT_RU } from '../../utils/dayNames';
import { toIsoDate } from '../../utils/isoDate';
import { formatString } from '../../utils/agendaI18n';
import { currentUiStrings } from '../../utils/uiStrings';
import { exec } from '../../utils/exec';
import type { ExecFileCallback } from '../_execFake';

/**
 * A task written by saying it, from the phrase to the lines in the file.
 *
 * Driven against the real extractor rather than a stub: what is being checked
 * is exactly the crossing — the subcommand, the arguments it is given, the
 * JSON it answers with and the two lines that come out of it — and a fake
 * would be a second copy of the answer this feature exists to consume.
 *
 * The phrases are Russian and dated relative to a day the test picks, so what
 * they resolve to is a date the assertions can name.
 */
suite('Insert Task from Phrase', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const originalInputBox = vscode.window.showInputBox;

    let originalExtractorPath: string | undefined;
    let originalWeekdayLocale: string | undefined;
    let document: vscode.TextDocument | undefined;

    before(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        originalExtractorPath = config.get<string>('extractorPath');
        originalWeekdayLocale = config.get<string>('weekdayLocale');
        // The bundled binary is what these tests are about, and the weekday
        // language is fixed so the timestamp reads the same on any machine.
        await config.update('extractorPath', '', vscode.ConfigurationTarget.Global);
        await config.update('weekdayLocale', 'ru', vscode.ConfigurationTarget.Global);
    });

    after(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('extractorPath', originalExtractorPath ?? '', vscode.ConfigurationTarget.Global);
        await config.update('weekdayLocale', originalWeekdayLocale ?? 'ru', vscode.ConfigurationTarget.Global);
    });

    beforeEach(function () {
        if (!fs.existsSync(path.join(repoRoot, 'bin', bundledBinaryName(process.platform)))) {
            // Fetched on demand (`scripts/download-extractor.sh`), not built
            // here; a checkout without it skips rather than fails.
            this.skip();
        }
    });

    afterEach(async () => {
        (vscode.window as { showInputBox: unknown }).showInputBox = originalInputBox;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    /** Answer the box with each phrase in turn, then with Enter on an empty one. */
    function say(...phrases: string[]): void {
        const answers = [...phrases, ''];
        let next = 0;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(answers[next++]);
    }

    /**
     * Answer the box while keeping the prompts it was shown with.
     *
     * The prompt is where the microphone is named, so the tests about it need
     * the options the box was opened with rather than only its answer.
     */
    function sayAndWatch(...phrases: string[]): string[] {
        const answers = [...phrases, ''];
        const prompts: string[] = [];
        let next = 0;
        (vscode.window as { showInputBox: unknown }).showInputBox = (options?: vscode.InputBoxOptions) => {
            prompts.push(options?.prompt ?? '');
            return Promise.resolve(answers[next++]);
        };
        return prompts;
    }

    /**
     * Answer the mixer with `muted`, leaving every other process alone.
     *
     * The extractor runs through the same wrapper, and these tests are driven
     * against the real one, so the fake has to hand everything that is not
     * `pactl` back to the original.
     */
    function mixerSays(muted: boolean): () => void {
        const original = exec.execFile;
        exec.execFile = (...args: Parameters<typeof exec.execFile>) => {
            if (args[0] !== 'pactl') {
                return original(...args);
            }
            const callback = args.at(-1) as ExecFileCallback;
            callback(null, muted ? 'Mute: yes\n' : 'Mute: no\n', '');
            return undefined as unknown as ReturnType<typeof exec.execFile>;
        };
        return () => {
            exec.execFile = original;
        };
    }

    /** Dismiss the box with Escape. */
    function dismiss(): void {
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(undefined);
    }

    async function open(content: string, cursorLine = 0): Promise<vscode.TextDocument> {
        document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        // The cursor goes in with the editor rather than after it: assigning
        // `selection` to the editor `showTextDocument` returns is not in
        // effect by the time the command reads it on VS Code 1.136.
        await vscode.window.showTextDocument(document, {
            selection: new vscode.Range(cursorLine, 0, cursorLine, 0)
        });
        return document;
    }

    /** Today and tomorrow as the extractor will resolve them. */
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    test('one phrase becomes a heading and a planning line', async () => {
        const doc = await open('# Notes\n\n## Errands\ntext\n', 3);

        say('позвонить врачу завтра в 15:00');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        const written = doc.getText();
        assert.match(written, /### TODO позвонить врачу/);
        assert.match(
            written,
            new RegExp(`SCHEDULED: <${toIsoDate(tomorrow)} ${DAY_NAMES_SHORT_RU[tomorrow.getDay()]} 15:00>`)
        );
    });

    test('a second phrase refines the first rather than starting over', async () => {
        const doc = await open('## Errands\ntext\n', 1);

        say('позвонить врачу завтра в 15:00, каждую неделю', 'в 16:00');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        const written = doc.getText();
        assert.match(written, /### TODO позвонить врачу/);
        // The hour moved; the day and the repeater are what the first phrase
        // left, which is the extractor's folding and not this command's.
        assert.match(written, new RegExp(`<${toIsoDate(tomorrow)} \\S+ 16:00 \\+1w>`));
    });

    test('the entry joins the note the cursor stands in, one level deeper', async () => {
        const doc = await open('# Journal\n\n## Monday\ntext\n\n## Tuesday\ntext\n', 3);

        say('купить хлеб');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        const lines = doc.getText().split('\n');
        const entry = lines.findIndex((line) => line.includes('купить хлеб'));
        assert.ok(entry > 0, 'the entry was written');
        assert.strictEqual(lines[entry], '### TODO купить хлеб');
        // Before the heading that ends the note it joined, not after it.
        assert.ok(entry < lines.indexOf('## Tuesday'));
    });

    test('a phrase that named no date is a heading and the moment it was written at', async () => {
        const doc = await open('## Errands\ntext\n', 1);

        say('купить хлеб');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        assert.match(doc.getText(), /### TODO купить хлеб/);
        assert.doesNotMatch(doc.getText(), /SCHEDULED/);
        assert.match(doc.getText(), new RegExp(`CREATED: \\[${toIsoDate(today)} \\S+ \\d\\d:\\d\\d]`));
    });

    test('the moment the entry was written at stands above the day it is planned for', async () => {
        const doc = await open('## Errands\ntext\n', 1);

        say('позвонить врачу завтра в 15:00');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        const lines = doc.getText().split('\n');
        const entry = lines.findIndex((line) => line.includes('позвонить врачу'));
        assert.ok(entry > 0, 'the entry was written');
        // The order the phone writes them in as well: what the entry is, then
        // what it is planned for.
        assert.match(lines[entry + 1] ?? '', new RegExp(`CREATED: \\[${toIsoDate(today)} \\S+ \\d\\d:\\d\\d]`));
        assert.match(lines[entry + 2] ?? '', /SCHEDULED: </);
    });

    test('a deadline is written on its own keyword', async () => {
        const doc = await open('## Errands\ntext\n', 1);

        say('сдать отчёт до пятницы');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        assert.match(doc.getText(), /DEADLINE: </);
    });

    test('a priority said in words lands in the cookie', async () => {
        const doc = await open('## Errands\ntext\n', 1);

        say('срочно позвонить врачу');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        assert.match(doc.getText(), /### TODO \[#A] позвонить врачу/);
    });

    test('English is understood on a Russian screen', async () => {
        const doc = await open('## Errands\ntext\n', 1);

        say('call the doctor tomorrow at 15:00');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        assert.match(doc.getText(), /### TODO call the doctor/);
        assert.match(doc.getText(), new RegExp(`<${toIsoDate(tomorrow)} \\S+ 15:00>`));
    });

    test('escape writes nothing', async () => {
        const before = '## Errands\ntext\n';
        const doc = await open(before, 1);

        dismiss();
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        assert.strictEqual(doc.getText(), before);
    });

    test('a file with no heading takes the entry at the cursor', async () => {
        const doc = await open('plain text\nmore text\n', 1);

        say('купить хлеб');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        assert.match(doc.getText(), /^# TODO купить хлеб$/m);
    });

    test('what the rules do not know stays in the heading', async () => {
        const doc = await open('## Errands\ntext\n', 1);

        say('купить подарок для мамы');
        await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');

        assert.match(doc.getText(), /### TODO купить подарок для мамы/);
    });

    test('a muted microphone is named under the box', async () => {
        await open('## Errands\ntext\n', 1);
        const restore = mixerSays(true);
        const prompts = sayAndWatch('купить хлеб');

        try {
            await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');
        } finally {
            restore();
        }

        // Read from the same dictionary the command reads, because which
        // language this editor speaks is the runner's business, not this
        // test's.
        const said = currentUiStrings().strings.phrasePrompt;
        // Every box, not only the first: the microphone can be unmuted between
        // one phrase and the next, and the reminder has to keep up either way.
        assert.ok(prompts.length >= 2, 'the box opened for a phrase and for the one after it');
        assert.strictEqual(prompts[0], formatString(said.muted, said.prompt));
        assert.strictEqual(prompts[1], formatString(said.muted, said.promptMore));
    });

    test('a microphone that is on leaves the prompt as it was', async () => {
        await open('## Errands\ntext\n', 1);
        const restore = mixerSays(false);
        const prompts = sayAndWatch('купить хлеб');

        try {
            await vscode.commands.executeCommand('markdown-org.insertTaskFromPhrase');
        } finally {
            restore();
        }

        assert.strictEqual(prompts[0], currentUiStrings().strings.phrasePrompt.prompt);
    });
});
