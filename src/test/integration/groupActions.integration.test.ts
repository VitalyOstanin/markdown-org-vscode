import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as sinon from 'sinon';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';
import {
    applyGroupAction,
    clearGroupRollbackForTesting,
    hasGroupRollbackForTesting,
    undoLastGroupAction
} from '../../commands/groupActions';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';
import { makeExtractorFake } from '../_execFake';
import { waitForAgendaRender, waitUntil } from './_helpers';

/**
 * Acting on a whole band of overdue entries.
 *
 * Two halves that only meet in the running editor: the day card offers the menu
 * on the overdue bands and nowhere else, and the action itself rewrites real
 * notes on disk and can put them back.
 */
suite('Group actions on an overdue band', () => {
    const root = path.join(__dirname, '../../test-workspace-group-actions');
    const strings = AGENDA_STRINGS.en;

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;
    let showInfoStub: sinon.SinonStub;
    /** What `workspaceDir` was before this suite pointed it at its own notes. */
    let previousWorkspaceDir: string | undefined;

    /** A day whose backlog spans two bands, plus work that is not overdue. */
    const backlogDay = {
        date: '2026-08-10',
        overdue: [
            {
                file: path.join(root, 'repeat.md'),
                line: 1,
                heading: 'Water the plants',
                content: '',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED',
                timestamp_repeater: '++2d',
                days_offset: -9
            },
            {
                file: path.join(root, 'bills.md'),
                line: 1,
                heading: 'Pay the bill',
                content: '',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED',
                days_offset: -3
            }
        ],
        scheduled_timed: [
            {
                file: path.join(root, 'bills.md'),
                line: 4,
                heading: 'Standup',
                content: '',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED'
            }
        ],
        scheduled_no_time: [],
        upcoming: []
    };

    function writeNote(name: string, lines: string[]): string {
        const file = path.join(root, name);
        fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
        return file;
    }

    function readNote(file: string): string[] {
        return fs.readFileSync(file, 'utf8').split('\n');
    }

    before(() => {
        fs.mkdirSync(root, { recursive: true });
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        // Restored afterwards: this suite's directory is deleted at the end,
        // and a later suite left pointing at it renders no agenda at all.
        previousWorkspaceDir = config.inspect<string>('workspaceDir')?.workspaceValue;
        await config.update('workspaceDir', root, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'en', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        execFileStub = sinon.stub(exec, 'execFile');
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
        // The result toast offers an undo and stays until it is answered; the
        // tests drive the undo directly, so it is answered with a dismissal.
        showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        clearGroupRollbackForTesting();
    });

    afterEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', previousWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'auto', vscode.ConfigurationTarget.Workspace);
        execFileStub.restore();
        resolveExtractorStub.restore();
        showErrorStub.restore();
        showInfoStub.restore();
        clearGroupRollbackForTesting();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('only the overdue bands offer an action on the whole group', async function () {
        this.timeout(15000);
        execFileStub.callsFake(
            makeExtractorFake({ day: [backlogDay], week: [backlogDay], month: [backlogDay], tasks: [], holidays: [] })
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.deepStrictEqual(info.sectionMenus, ['overdue-repeat', 'overdue-recent']);
        // The day's own work is rendered as a section too, and carries none.
        assert.ok(info.sections.includes('At a set time'), `sections were: ${info.sections.join(', ')}`);
    });

    test('the week offers the same action, and it lands on the day it was opened from', async function () {
        this.timeout(15000);
        // Two days, each with a backlog of its own. The band keys repeat across
        // the week, so the menu has to say which day it stands under -- without
        // that the first day of the payload answers for all seven.
        const monday = writeNote('week-monday.md', ['## TODO Monday task', '`SCHEDULED: <2026-05-04 Mon>`']);
        const wednesday = writeNote('week-wednesday.md', ['## TODO Wednesday task', '`SCHEDULED: <2026-05-06 Wed>`']);
        const overdueOn = (date: string, file: string, heading: string) => ({
            date,
            overdue: [
                {
                    file,
                    line: 1,
                    heading,
                    content: '',
                    task_type: 'TODO',
                    timestamp_type: 'SCHEDULED',
                    days_offset: -3
                }
            ],
            scheduled_timed: [],
            scheduled_no_time: [],
            upcoming: []
        });
        const week = [
            overdueOn('2026-08-10', monday, 'Monday task'),
            overdueOn('2026-08-12', wednesday, 'Wednesday task')
        ];
        execFileStub.callsFake(makeExtractorFake({ day: [], week, month: [], tasks: [], holidays: [] }));

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.deepStrictEqual(
            info.sectionMenus,
            ['overdue-recent', 'overdue-recent'],
            'both days offer the action on their own backlog'
        );

        await AgendaPanel.clickGroupActionForTesting('overdue-recent', 'drop-planning', '2026-08-12');
        // The write goes through the extension host, so the file is read back
        // once it has landed rather than immediately.
        await waitUntil(
            () => readNote(wednesday)[1] === '',
            'the planning line of the day the menu was opened on to be dropped'
        );
        assert.deepStrictEqual(
            readNote(monday),
            ['## TODO Monday task', '`SCHEDULED: <2026-05-04 Mon>`', ''],
            'the other day of the week must be untouched'
        );
    });

    test('the tasks view offers none: its groups are priorities, not a backlog', async function () {
        this.timeout(15000);
        const tasks = [
            { file: path.join(root, 'bills.md'), line: 1, heading: 'Pay the bill', content: '', task_type: 'TODO' }
        ];
        execFileStub.callsFake(makeExtractorFake({ day: [], week: [], month: [], tasks, holidays: [] }));

        await vscode.commands.executeCommand('markdown-org.showTasks');
        await waitForAgendaRender('tasks');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.deepStrictEqual(info.sectionMenus, []);
    });

    // Each test writes its own notes: a note left open by an earlier test is
    // served from the editor's model, and rewriting the file underneath it
    // would be read back as the text the earlier test wrote.
    test('one move rewrites every file of the band, and the undo puts them back', async () => {
        const bills = writeNote('drop-bills.md', ['## TODO Pay the bill', '`SCHEDULED: <2026-05-04 Mon>`']);
        const rent = writeNote('drop-rent.md', ['## TODO Send the reading', '`SCHEDULED: <2026-05-06 Wed>`']);
        const before = { bills: readNote(bills), rent: readNote(rent) };

        const changed = await applyGroupAction(
            'drop-planning',
            [
                { file: bills, line: 1, heading: 'Pay the bill', keyword: 'SCHEDULED' },
                { file: rent, line: 1, heading: 'Send the reading', keyword: 'SCHEDULED' }
            ],
            strings,
            'en'
        );

        assert.strictEqual(changed, true);
        assert.deepStrictEqual(readNote(bills), ['## TODO Pay the bill', '']);
        assert.deepStrictEqual(readNote(rent), ['## TODO Send the reading', '']);

        await undoLastGroupAction(strings, 'en');
        assert.deepStrictEqual(readNote(bills), before.bills);
        assert.deepStrictEqual(readNote(rent), before.rent);
    });

    test('a note that changed since the move is left as it is by the undo', async () => {
        const bills = writeNote('undo-bills.md', ['## TODO Pay the bill', '`SCHEDULED: <2026-05-04 Mon>`']);
        const rent = writeNote('undo-rent.md', ['## TODO Send the reading', '`SCHEDULED: <2026-05-06 Wed>`']);

        await applyGroupAction(
            'cancel',
            [
                { file: bills, line: 1, heading: 'Pay the bill' },
                { file: rent, line: 1, heading: 'Send the reading' }
            ],
            strings,
            'en'
        );
        assert.match(readNote(bills)[0] ?? '', /^## CANCELLED /);

        // Something else edited the note in the meantime -- a sync, another
        // window. Its text no longer matches what the action wrote.
        const edited = await vscode.workspace.openTextDocument(vscode.Uri.file(bills));
        const editor = await vscode.window.showTextDocument(edited);
        await editor.edit((builder) => {
            builder.insert(new vscode.Position(edited.lineCount, 0), 'a later note\n');
        });
        await edited.save();

        await undoLastGroupAction(strings, 'en');
        assert.match(readNote(bills)[0] ?? '', /^## CANCELLED /, 'the changed note must keep what it has');
        assert.match(readNote(rent)[0] ?? '', /^## TODO /, 'the untouched note goes back');
    });

    test('a band whose headings have all moved changes nothing', async () => {
        const bills = writeNote('moved-bills.md', ['## TODO Something else', '`SCHEDULED: <2026-05-04 Mon>`']);

        const changed = await applyGroupAction(
            'move-to-today',
            [{ file: bills, line: 1, heading: 'Pay the bill', keyword: 'SCHEDULED' }],
            strings,
            'en'
        );

        assert.strictEqual(changed, false);
        assert.deepStrictEqual(readNote(bills), ['## TODO Something else', '`SCHEDULED: <2026-05-04 Mon>`', '']);
        // And nothing is armed for the undo: a move that wrote no file has
        // nothing to put back.
        assert.strictEqual(hasGroupRollbackForTesting(), false);
    });
});
