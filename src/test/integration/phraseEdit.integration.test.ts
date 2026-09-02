import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { bundledBinaryName } from '../../utils/bundledBinary';
import { DAY_NAMES_SHORT_RU } from '../../utils/dayNames';
import { toIsoDate } from '../../utils/isoDate';

/**
 * An entry changed by saying what to change, from the phrase to the lines in
 * the file.
 *
 * Driven against the real extractor, like the tests for writing an entry: what
 * is checked is the crossing — the subcommand, the two keys only an edit reads
 * (`keyword` and `cleared`), and the lines that come out of them.
 *
 * The phrases are Russian and dated relative to a day the test picks, so what
 * they resolve to is a date the assertions can name.
 */
suite('Edit Task from Phrase', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const originalInputBox = vscode.window.showInputBox;

    let originalExtractorPath: string | undefined;
    let originalWeekdayLocale: string | undefined;
    let document: vscode.TextDocument | undefined;

    before(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        originalExtractorPath = config.get<string>('extractorPath');
        originalWeekdayLocale = config.get<string>('weekdayLocale');
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

    /** Answer the box with one phrase, which is all this command asks for. */
    function say(phrase: string): void {
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(phrase);
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

    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const tomorrowStamp = `${toIsoDate(tomorrow)} ${DAY_NAMES_SHORT_RU[tomorrow.getDay()]}`;

    /** An entry with a keyword, a priority, a day and an hour. */
    const ENTRY = [
        '# Заметки',
        '',
        '## TODO [#B] позвонить врачу',
        '    `SCHEDULED: <2026-09-01 Вт 15:00>`',
        '',
        'Текст под записью.',
        ''
    ].join('\n');

    test('a keyword said in words replaces the one the heading carries', async () => {
        const doc = await open(ENTRY, 2);

        say('отметь выполненной');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.match(doc.getText(), /## DONE \[#B] позвонить врачу/);
        // The planning line is untouched: the phrase said nothing about it.
        assert.match(doc.getText(), /SCHEDULED: <2026-09-01 Вт 15:00>/);
    });

    test('a day said in words moves the planning line and keeps the hour', async () => {
        const doc = await open(ENTRY, 3);

        say('перенеси на завтра');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.match(doc.getText(), new RegExp(`SCHEDULED: <${tomorrowStamp} 15:00>`));
    });

    test('emptying the hour leaves the day', async () => {
        const doc = await open(ENTRY, 2);

        say('убрать время');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.match(doc.getText(), /SCHEDULED: <2026-09-01 Вт>/);
    });

    test('emptying the date takes the planning line out', async () => {
        const doc = await open(ENTRY, 2);

        say('убрать дату');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.doesNotMatch(doc.getText(), /SCHEDULED/);
        // Only that line: the heading and the text under it stay.
        assert.match(doc.getText(), /## TODO \[#B] позвонить врачу/);
        assert.match(doc.getText(), /Текст под записью\./);
    });

    test('two instructions in one phrase are both applied', async () => {
        const doc = await open(ENTRY, 2);

        say('перенеси на завтра в 16:00 и сделай срочной');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.match(doc.getText(), /## TODO \[#A] позвонить врачу/);
        assert.match(doc.getText(), new RegExp(`SCHEDULED: <${tomorrowStamp} 16:00>`));
    });

    test('an entry without a planning line gains one', async () => {
        const doc = await open('## TODO купить хлеб\nтекст\n', 0);

        say('перенеси на завтра');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        const lines = doc.getText().split('\n');
        assert.strictEqual(lines[0], '## TODO купить хлеб');
        assert.match(lines[1] ?? '', new RegExp(`SCHEDULED: <${tomorrowStamp}>`));
        assert.strictEqual(lines[2], 'текст');
    });

    test('a word the rules do not know changes nothing', async () => {
        const doc = await open(ENTRY, 2);

        say('перенеси на завтра совсем');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        // The leftover is what the phrase is refused over: applying the half
        // that was understood would change a field nobody meant to name.
        assert.strictEqual(doc.getText(), ENTRY);
    });

    test('escape changes nothing', async () => {
        const doc = await open(ENTRY, 2);

        dismiss();
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.strictEqual(doc.getText(), ENTRY);
    });

    test('English is understood on a Russian screen', async () => {
        const doc = await open(ENTRY, 2);

        say('mark as cancelled');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.match(doc.getText(), /## CANCELLED \[#B] позвонить врачу/);
    });

    test('a note written in English keeps its English weekdays', async () => {
        const english = ['## TODO call the doctor', '    `SCHEDULED: <2026-09-01 Tue 15:00>`', 'text', ''].join('\n');
        const doc = await open(english, 0);

        say('убрать время');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        // The screen is Russian here, and the file is not: the spelling comes
        // from the line being rewritten.
        assert.match(doc.getText(), /SCHEDULED: <2026-09-01 Tue>/);
    });

    test('an entry the phrase already describes is left byte for byte', async () => {
        const doc = await open(ENTRY, 2);

        say('в работу');
        await vscode.commands.executeCommand('markdown-org.editTaskFromPhrase');

        assert.strictEqual(doc.getText(), ENTRY);
    });
});
