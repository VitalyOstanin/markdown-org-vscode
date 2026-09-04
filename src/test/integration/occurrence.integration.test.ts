import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as sinon from 'sinon';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';
import { makeExtractorFake } from '../_execFake';
import { toIsoDate } from '../../utils/isoDate';
import { waitForAgendaRender, waitUntil } from './_helpers';

/**
 * The two exceptions a repeating entry can carry, written from the editor.
 *
 * The shape landing in the file is unit-tested against the Android client's
 * own tests (occurrenceEdit.test.ts); what is checked here is the crossing --
 * the boxes the command asks, the entry it acts on, and that the write reaches
 * the open document rather than only the array of lines.
 */
suite('One occurrence of a series', () => {
    const originalInputBox = vscode.window.showInputBox;
    let document: vscode.TextDocument | undefined;

    afterEach(async () => {
        (vscode.window as { showInputBox: unknown }).showInputBox = originalInputBox;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        document = undefined;
    });

    /** Answer the boxes in order; `undefined` is Escape, and a missing answer is one too. */
    function answer(...values: (string | undefined)[]): void {
        const queue = [...values];
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(queue.shift());
    }

    /** What the boxes were offered, so a test can check the day it opens on. */
    function record(values: (string | undefined)[]): string[] {
        const seen: string[] = [];
        const queue = [...values];
        (vscode.window as { showInputBox: unknown }).showInputBox = (options?: { value?: string }) => {
            seen.push(options?.value ?? '');
            return Promise.resolve(queue.shift());
        };
        return seen;
    }

    async function open(content: string, cursorLine = 0): Promise<vscode.TextDocument> {
        document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(document, {
            selection: new vscode.Range(cursorLine, 0, cursorLine, 0)
        });
        return document;
    }

    /** A weekly class, which is the case these operations exist for. */
    const SERIES = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''].join('\n');

    test('a cancelled occurrence joins the series EXDATE', async () => {
        const doc = await open(SERIES);

        answer('2026-08-20');
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence');

        assert.strictEqual(
            doc.getText(),
            [
                '# TODO English',
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
                '```org-properties',
                'EXDATE: 2026-08-20',
                '```',
                ''
            ].join('\n')
        );
    });

    test('a moved occurrence is an entry of its own at the end of the file', async () => {
        const doc = await open(SERIES);

        answer('2026-08-20', '2026-08-22', '18:00');
        await vscode.commands.executeCommand('markdown-org.moveOccurrence');

        const text = doc.getText();
        assert.match(text, /SCHEDULED: <2026-08-06 Thu 15:00 \+1w>/, 'the series goes on repeating');
        assert.match(text, /\nID: [0-9a-f-]{36}\n/, 'the series is named so the replacement can point at it');
        assert.match(text, /\n# TODO English\n`SCHEDULED: <2026-08-22 Sat 18:00>`\n/);
        assert.match(text, /\nRECURRENCE_ID: 2026-08-20 15:00\n/);
        assert.ok(!text.includes('EXDATE'), 'a replacement needs no EXDATE beside it');
    });

    test('the day of the series is what the box opens on', async () => {
        await open(SERIES);

        const seen = record(['2026-08-06', undefined]);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence');

        assert.deepStrictEqual(seen, ['2026-08-06', '2026-08-06']);
    });

    test('a day the caller names is what the box opens on', async () => {
        await open(SERIES);

        const seen = record([undefined]);
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence', '2026-08-27');

        assert.deepStrictEqual(seen, ['2026-08-27']);
    });

    test('escaping a box leaves the file alone', async () => {
        const doc = await open(SERIES);

        answer(undefined);
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence');

        assert.strictEqual(doc.getText(), SERIES);
    });

    test('an entry that does not repeat is refused, and the file is left alone', async () => {
        const once = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00>`', ''].join('\n');
        const doc = await open(once);

        answer('2026-08-06');
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence');

        assert.strictEqual(doc.getText(), once);
    });
});

/**
 * The way in from the agenda: the flag of a repeating row.
 *
 * The row stands for one occurrence of a series, and the flag is what says so;
 * pressing it opens the entry and offers the two things that can be done to
 * that one occurrence. The day travels with the press, which is what makes the
 * choice about the occurrence the reader pointed at rather than about the
 * series' own date.
 */
suite('One occurrence, from the agenda', () => {
    const root = path.join(__dirname, '../../test-workspace-occurrence');
    const notes = path.join(root, 'series.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let quickPickStub: sinon.SinonStub;
    let previousWorkspaceDir: string | undefined;
    const inputBox = vscode.window.showInputBox;

    /**
     * A weekly class, drawn on the day the panel is anchored on -- which is
     * today, because that is the day `Show Agenda (Day)` opens. The occurrence
     * the row stands for is its own `timestamp_date`, which is what the flag
     * carries and what the exception is about.
     */
    const day = {
        date: toIsoDate(new Date()),
        overdue: [],
        scheduled_timed: [
            {
                file: notes,
                line: 1,
                heading: 'English',
                content: '',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED',
                timestamp_repeater: '+1w',
                timestamp_date: '2026-08-20',
                timestamp_time: '15:00'
            }
        ],
        scheduled_no_time: [],
        upcoming: []
    };

    before(() => {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(notes, '# TODO English\n`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`\n', 'utf8');
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        previousWorkspaceDir = config.inspect<string>('workspaceDir')?.workspaceValue;
        await config.update('workspaceDir', root, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'en', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        execFileStub = sinon
            .stub(exec, 'execFile')
            .callsFake(makeExtractorFake({ day: [day], week: [day], month: [day], tasks: [], holidays: [] }));
        quickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    });

    afterEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', previousWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'auto', vscode.ConfigurationTarget.Workspace);
        execFileStub.restore();
        resolveExtractorStub.restore();
        quickPickStub.restore();
        (vscode.window as { showInputBox: unknown }).showInputBox = inputBox;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    /** Press the flag and wait for the choice it raises. */
    async function pressTheFlag(): Promise<void> {
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');
        await AgendaPanel.clickOccurrenceFlagForTesting(1);
        await waitUntil(() => quickPickStub.called, 'the flag raised no choice');
    }

    test('the flag opens the entry and offers the two exceptions', async function () {
        this.timeout(20000);
        quickPickStub.resolves(undefined);

        await pressTheFlag();

        const [items, options] = quickPickStub.firstCall.args as [{ label: string }[], { title: string }];
        assert.deepStrictEqual(
            items.map((item) => item.label),
            [AGENDA_STRINGS.en.occurrence.move, AGENDA_STRINGS.en.occurrence.cancel]
        );
        assert.ok(options.title.includes('2026-08-20'), `the title was: ${options.title}`);
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, notes, 'the entry is on screen');
    });

    test('the day the row was drawn on is the day the box opens on', async function () {
        this.timeout(20000);
        const offered: string[] = [];
        (vscode.window as { showInputBox: unknown }).showInputBox = (options?: { value?: string }) => {
            offered.push(options?.value ?? '');
            return Promise.resolve(undefined);
        };
        quickPickStub.callsFake((items: { command: string }[]) => Promise.resolve(items[1]));

        await pressTheFlag();
        await waitUntil(() => offered.length > 0, 'no box was opened');

        // The series is planned for 2026-08-06; the row was drawn on the 20th,
        // which is the occurrence the reader pointed at.
        assert.deepStrictEqual(offered, ['2026-08-20']);
    });
});
