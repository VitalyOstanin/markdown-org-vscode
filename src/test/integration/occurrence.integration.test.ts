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
    let quickPick: sinon.SinonStub | null = null;
    const inputBox = vscode.window.showInputBox;
    let document: vscode.TextDocument | undefined;

    afterEach(async () => {
        quickPick?.restore();
        quickPick = null;
        (vscode.window as { showInputBox: unknown }).showInputBox = inputBox;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        document = undefined;
    });

    /** Pick the day at `index` of the list the command offers. */
    function pickDay(index: number): sinon.SinonStub {
        quickPick = sinon.stub(vscode.window, 'showQuickPick');
        quickPick.callsFake((items: unknown) => Promise.resolve((items as unknown[])[index]));
        return quickPick;
    }

    /** Answer the list with Escape. */
    function pickNothing(): sinon.SinonStub {
        quickPick = sinon.stub(vscode.window, 'showQuickPick');
        quickPick.resolves(undefined);
        return quickPick;
    }

    async function open(content: string, cursorLine = 0): Promise<vscode.TextDocument> {
        document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(document, {
            selection: new vscode.Range(cursorLine, 0, cursorLine, 0)
        });
        return document;
    }

    /** Rewrite the `MOVED` line, which is what walking its date with Shift+Up leaves behind. */
    async function walkTheMoveTo(doc: vscode.TextDocument, day: string): Promise<void> {
        const at = doc
            .getText()
            .split('\n')
            .findIndex((line) => line.includes('`MOVED: '));
        assert.ok(at >= 0, 'nothing was moved');
        const line = doc.lineAt(at);
        const editor = vscode.window.activeTextEditor;
        assert.ok(editor, 'no editor');
        await editor.edit((builder) => {
            builder.replace(line.range, line.text.replace(/-> <\d{4}-\d{2}-\d{2}/, `-> <${day}`));
        });
    }

    /**
     * A weekly class, which is the case these operations exist for. Today is
     * far behind it, so the days the picker offers are the series' own,
     * counted from its date.
     */
    const SERIES = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''].join('\n');

    test('a cancelled occurrence joins the series EXDATE', async () => {
        const doc = await open(SERIES);

        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence', '2026-08-20');

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

    test('the days offered are the ones the series falls on', async () => {
        await open(SERIES);

        const picker = pickNothing();
        await vscode.commands.executeCommand('markdown-org.moveOccurrence');

        const [items] = picker.firstCall.args as [{ label: string }[]];
        // Every day of the series ahead of today, at the hour it is held, and
        // the way out for one the list does not reach.
        assert.ok(items.length > 1, 'the list was empty');
        assert.ok(
            items.slice(0, -1).every((item) => /^\d{4}-\d{2}-\d{2} 15:00$/.test(item.label)),
            `the list was: ${items.map((item) => item.label).join(', ')}`
        );
        assert.match(items.at(-1)?.label ?? '', /Another day/);
    });

    test('the day the caller names leads the list', async () => {
        await open(SERIES);

        const picker = pickNothing();
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence', '2026-08-20');

        const [items] = picker.firstCall.args as [{ label: string }[]];
        assert.strictEqual(items[0]?.label, '2026-08-20 15:00');
    });

    test('a move is written into the series, at the day and hour it is held', async () => {
        const doc = await open(SERIES);

        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-20');

        assert.strictEqual(
            doc.getText(),
            [
                '# TODO English',
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
                '`MOVED: [2026-08-20 Thu] -> <2026-08-20 Thu 15:00>`',
                ''
            ].join('\n')
        );
        const caret = vscode.window.activeTextEditor?.selection.active;
        assert.strictEqual(caret?.line, 2, 'the caret is on the line that moves it');
        assert.strictEqual(
            doc.lineAt(2).text.slice(caret.character, caret.character + 10),
            '2026-08-20',
            'the caret is on the day it moves to'
        );
    });

    test('the occurrence it names is walked with the date keys, like the day it moves to', async () => {
        // ADR-0039 wrote the address as an inactive timestamp for exactly
        // this: correcting which occurrence moved is a keystroke rather than
        // an edit of text, and the weekday follows the day it names.
        const doc = await open(SERIES);

        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-20');

        const editor = vscode.window.activeTextEditor;
        assert.ok(editor, 'no editor');
        const line = doc.lineAt(2).text;
        const day = line.indexOf('[2026-08-20') + '[2026-08-'.length;
        editor.selection = new vscode.Selection(2, day, 2, day);
        await vscode.commands.executeCommand('markdown-org.timestampUp');

        assert.ok(doc.lineAt(2).text.includes('`MOVED: [2026-08-21 Fri]'), `the line was: ${doc.lineAt(2).text}`);
    });

    test('the series goes on repeating, and no replacement entry is written', async () => {
        const doc = await open(SERIES);

        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-20');
        await walkTheMoveTo(doc, '2026-08-22');

        const text = doc.getText();
        assert.match(text, /SCHEDULED: <2026-08-06 Thu 15:00 \+1w>/, 'the series goes on repeating');
        assert.ok(!text.includes('RECURRENCE_ID'), 'nothing stands in for the occurrence');
        assert.ok(!text.includes('ID: '), 'the series needs no identifier to be moved from');
        assert.ok(!text.includes('EXDATE'), 'a moved occurrence is not a cancelled one');
        assert.strictEqual(text.match(/^# /gm)?.length, 1, 'the file still holds one entry');
    });

    test('a day already moved opens where it now stands, and is moved again in place', async () => {
        const doc = await open(SERIES);

        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-20');
        await walkTheMoveTo(doc, '2026-08-22');

        quickPick?.restore();
        quickPick = null;
        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-20');

        const text = doc.getText();
        assert.strictEqual(text.match(/`MOVED: [^`]*`/g)?.length, 1, 'the occurrence is moved by one line, not by two');
        assert.ok(
            text.includes('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 15:00>`'),
            `the line was: ${text.split('\n')[2] ?? ''}`
        );
    });

    test('another occurrence of the same series gets a line of its own', async () => {
        const doc = await open(SERIES);

        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-20');

        quickPick?.restore();
        quickPick = null;
        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-27');

        assert.strictEqual(
            doc.getText(),
            [
                '# TODO English',
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
                '`MOVED: [2026-08-20 Thu] -> <2026-08-20 Thu 15:00>`',
                '`MOVED: [2026-08-27 Thu] -> <2026-08-27 Thu 15:00>`',
                ''
            ].join('\n')
        );
    });

    test('escaping the list leaves the file alone', async () => {
        const doc = await open(SERIES);

        pickNothing();
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence');

        assert.strictEqual(doc.getText(), SERIES);
    });

    test('an entry that does not repeat is refused, and the file is left alone', async () => {
        const once = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00>`', ''].join('\n');
        const doc = await open(once);

        pickDay(0);
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence', '2026-08-06');

        assert.strictEqual(doc.getText(), once);
    });
});

/**
 * The entry as the notes actually hold it.
 *
 * A series is rarely a heading with a planning line under it and nothing
 * else: a creation stamp stands above, a property block below, the keyword is
 * sometimes not written at all, and the date is sometimes a deadline. Each of
 * these hid the planning line from the operation at some point, and each is
 * checked end to end -- through the command, into the open document.
 */
suite('One occurrence, whatever the entry looks like', () => {
    let quickPick: sinon.SinonStub | null = null;
    let document: vscode.TextDocument | undefined;

    afterEach(async () => {
        quickPick?.restore();
        quickPick = null;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        document = undefined;
    });

    async function moveFirstOf(content: string): Promise<vscode.TextDocument> {
        document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(document, { selection: new vscode.Range(0, 0, 0, 0) });
        quickPick = sinon.stub(vscode.window, 'showQuickPick');
        quickPick.callsFake((items: unknown) => Promise.resolve((items as unknown[])[0]));
        await vscode.commands.executeCommand('markdown-org.moveOccurrence', '2026-08-20');
        return document;
    }

    test('a series planned with SCHEDULED', async () => {
        const doc = await moveFirstOf(['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''].join('\n'));

        assert.match(doc.getText(), /\n`MOVED: \[2026-08-20 Thu\] -> <2026-08-20 Thu 15:00>`\n/);
    });

    test('a series that names no keyword at all', async () => {
        const doc = await moveFirstOf(['# English', '`<2026-08-06 Thu 15:00 +1w>`', ''].join('\n'));

        // The keyword belongs to the series' own line; the move carries its
        // own and says nothing about how the series is planned.
        assert.match(doc.getText(), /\n`MOVED: \[2026-08-20 Thu\] -> <2026-08-20 Thu 15:00>`\n/);
        assert.ok(!doc.getText().includes('SCHEDULED'), 'no keyword was invented');
    });

    test('a series kept on a DEADLINE', async () => {
        const doc = await moveFirstOf(['# TODO Report', '`DEADLINE: <2026-08-06 Thu +1w>`', ''].join('\n'));

        assert.match(
            doc.getText(),
            /\n`MOVED: \[2026-08-20 Thu\] -> <2026-08-20 Thu>`\n/,
            'a series with no hour names none'
        );
    });

    test('a series under a creation stamp and above a property block', async () => {
        const doc = await moveFirstOf(
            [
                '## English',
                '`CREATED: [2025-12-08 Mon 01:06]`',
                '`SCHEDULED: <2025-12-08 Mon 15:00 +1w>`',
                '```org-properties',
                'GCAL_EVENT_ID: cfdc2b9f',
                'ID: cfdc2b9f-2b70-4aca-b917-c13b96ca3c65',
                '```',
                ''
            ].join('\n')
        );

        const text = doc.getText();
        // Under the planning line and above the properties, which is where the
        // dates of an entry stand.
        assert.match(
            text,
            /`SCHEDULED: <2025-12-08 Mon 15:00 \+1w>`\n`MOVED: \[2026-08-20 Thu\] -> <2026-08-20 Thu 15:00>`\n```org-properties\n/
        );
        assert.ok(!text.includes('SERIES_ID'), 'a line inside the entry points at nothing');
        assert.strictEqual(text.match(/^ID: /gm)?.length, 1, 'the entry keeps its one ID');
    });

    test('a series below a keyword written without its colon', async () => {
        const doc = await moveFirstOf(
            [
                '## English',
                '`SCHEDULED <2025-12-01 Mon 15:00 +1w>`',
                '`SCHEDULED: <2025-12-08 Mon 15:00 +1w>`',
                ''
            ].join('\n')
        );

        const text = doc.getText();
        assert.match(text, /\n`MOVED: \[2026-08-20 Thu\] -> <2026-08-20 Thu 15:00>`\n/);
        assert.ok(text.includes('`SCHEDULED <2025-12-01 Mon 15:00 +1w>`'), 'the line typed by hand is untouched');
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

    test('the day the row was drawn on leads the days the choice offers', async function () {
        this.timeout(20000);
        // Two lists in a row: the exceptions, then the days one of them is
        // about. The second is the one under test, so the first is answered
        // with "cancel" and the second with Escape.
        const offered: string[][] = [];
        quickPickStub.callsFake((items: { label: string }[]) => {
            offered.push(items.map((item) => item.label));
            return Promise.resolve(offered.length === 1 ? items[1] : undefined);
        });

        await pressTheFlag();
        await waitUntil(() => offered.length > 1, 'no days were offered');

        // The series is planned for 2026-08-06; the row was drawn on the 20th,
        // which is the occurrence the reader pointed at.
        assert.strictEqual(offered[1]?.[0], '2026-08-20 15:00');
    });
});
