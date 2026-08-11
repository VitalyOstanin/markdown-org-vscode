import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as sinon from 'sinon';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';
import { clearGroupRollbackForTesting } from '../../commands/groupActions';
import { makeExtractorFake } from '../_execFake';
import { waitForAgendaRender, waitUntil } from './_helpers';

/**
 * Several note directories read as one agenda (`markdown-org.workspaceDirs`).
 *
 * Three things have to hold end to end, and none is visible from a unit test:
 * the extractor is asked for every configured directory, a row says which of
 * them it came from, and a chip that is off keeps the rows behind it out of
 * every edit made from that screen.
 */
suite('Agenda over several directories', () => {
    const workRoot = path.join(__dirname, '../../test-workspace-collections/work');
    const homeRoot = path.join(__dirname, '../../test-workspace-collections/home');
    const ignoredRoot = path.join(__dirname, '../../test-workspace-collections/ignored');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    /** A day whose two tasks come from two different roots. */
    const mixedDay = {
        date: '2026-08-10',
        overdue: [],
        scheduled_timed: [
            {
                file: path.join(workRoot, 'a.md'),
                root: workRoot,
                line: 1,
                heading: 'Work task',
                content: '',
                task_type: 'TODO'
            }
        ],
        scheduled_no_time: [
            {
                file: path.join(homeRoot, 'b.md'),
                root: homeRoot,
                line: 1,
                heading: 'Home task',
                content: '',
                task_type: 'TODO'
            }
        ],
        upcoming: []
    };

    /** The same day as a single-directory run reports it: no `root` anywhere. */
    const singleDay = {
        date: '2026-08-10',
        overdue: [],
        scheduled_timed: [
            { file: path.join(workRoot, 'a.md'), line: 1, heading: 'Work task', content: '', task_type: 'TODO' }
        ],
        scheduled_no_time: [],
        upcoming: []
    };

    /**
     * A backlog day whose overdue band spans both roots.
     *
     * The home row comes first so that a run which ignores the chips writes it
     * before the work row: the assertion that it was left alone then cannot
     * pass by winning a race.
     */
    const overdueDay = {
        date: '2026-08-10',
        overdue: [
            {
                file: path.join(homeRoot, 'od-home.md'),
                root: homeRoot,
                line: 1,
                heading: 'Home backlog',
                content: '',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED',
                days_offset: -3
            },
            {
                file: path.join(workRoot, 'od-work.md'),
                root: workRoot,
                line: 1,
                heading: 'Work backlog',
                content: '',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED',
                days_offset: -3
            }
        ],
        scheduled_timed: [],
        scheduled_no_time: [],
        upcoming: []
    };

    /** CLI arguments of the run that produced the agenda. */
    function agendaArgs(): string[] {
        const call = execFileStub
            .getCalls()
            .find((c) => (c.args[1] as string[]).includes('--agenda') || (c.args[1] as string[]).includes('--tasks'));
        return (call?.args[1] as string[] | undefined) ?? [];
    }

    before(() => {
        for (const dir of [workRoot, homeRoot, ignoredRoot]) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', ignoredRoot, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'en', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        execFileStub = sinon.stub(exec, 'execFile');
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        // Left behind, this setting would redirect every later suite's agenda.
        await config.update('workspaceDirs', undefined, vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'auto', vscode.ConfigurationTarget.Workspace);
        execFileStub.restore();
        resolveExtractorStub.restore();
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        fs.rmSync(path.dirname(workRoot), { recursive: true, force: true });
    });

    test('every configured directory is scanned, and the single-directory setting steps aside', async function () {
        this.timeout(15000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDirs', [workRoot, homeRoot], vscode.ConfigurationTarget.Workspace);
        execFileStub.callsFake(
            makeExtractorFake({ day: [mixedDay], week: [mixedDay], month: [mixedDay], tasks: [], holidays: [] })
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const args = agendaArgs();
        const dirs = args.filter((_value, index) => args[index - 1] === '--dir');
        assert.deepStrictEqual(dirs, [workRoot, homeRoot]);
        assert.ok(!dirs.includes(ignoredRoot), 'workspaceDir must not be scanned while workspaceDirs lists dirs');
    });

    test('a row names the directory it came from', async function () {
        this.timeout(15000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDirs', [workRoot, homeRoot], vscode.ConfigurationTarget.Workspace);
        execFileStub.callsFake(
            makeExtractorFake({ day: [mixedDay], week: [mixedDay], month: [mixedDay], tasks: [], holidays: [] })
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.deepStrictEqual(info.collectionMarks, ['From work', 'From home']);
    });

    test('a chip per directory, and pressing one takes its rows off the screen', async function () {
        this.timeout(15000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDirs', [workRoot, homeRoot], vscode.ConfigurationTarget.Workspace);
        execFileStub.callsFake(
            makeExtractorFake({ day: [mixedDay], week: [mixedDay], month: [mixedDay], tasks: [], holidays: [] })
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const before = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(before);
        assert.deepStrictEqual(before.collectionChips, ['work', 'home']);

        await AgendaPanel.clickCollectionChipForTesting(workRoot);
        const after = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(after);
        assert.deepStrictEqual(after.collectionChips, ['work (off)', 'home']);
        assert.deepStrictEqual(after.collectionMarks, ['From home']);

        // Pressing it again is the way back, and it must not need another scan:
        // the extractor is not asked anything between the two states.
        const runsBefore = execFileStub.callCount;
        await AgendaPanel.clickCollectionChipForTesting(workRoot);
        const back = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(back);
        assert.deepStrictEqual(back.collectionChips, ['work', 'home']);
        assert.deepStrictEqual(back.collectionMarks, ['From work', 'From home']);
        assert.strictEqual(execFileStub.callCount, runsBefore);
    });

    test('a group action skips the rows of a directory whose chip is off', async function () {
        this.timeout(20000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDirs', [workRoot, homeRoot], vscode.ConfigurationTarget.Workspace);
        execFileStub.callsFake(
            makeExtractorFake({ day: [overdueDay], week: [overdueDay], month: [overdueDay], tasks: [], holidays: [] })
        );
        // The result toast offers an undo and stays until it is answered.
        const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        const workNote = path.join(workRoot, 'od-work.md');
        const homeNote = path.join(homeRoot, 'od-home.md');
        fs.writeFileSync(workNote, '## TODO Work backlog\n`SCHEDULED: <2026-05-04 Mon>`\n', 'utf8');
        fs.writeFileSync(homeNote, '## TODO Home backlog\n`SCHEDULED: <2026-05-06 Wed>`\n', 'utf8');
        const homeBefore = fs.readFileSync(homeNote, 'utf8');

        try {
            await vscode.commands.executeCommand('markdown-org.showAgendaDay');
            await waitForAgendaRender('day');

            // The reader switches the home directory off, then answers the band
            // that is left on the screen.
            await AgendaPanel.clickCollectionChipForTesting(homeRoot);
            const after = await AgendaPanel.queryRenderedInfoForTesting();
            assert.ok(after);
            // Chip order follows the order the roots first appear in the day,
            // and the home row is the band's first.
            assert.deepStrictEqual(after.collectionChips, ['home (off)', 'work']);

            await AgendaPanel.clickGroupActionForTesting('overdue-recent', 'drop-planning');
            await waitUntil(
                () => !fs.readFileSync(workNote, 'utf8').includes('SCHEDULED'),
                'the visible row was not acted on'
            );

            assert.strictEqual(
                fs.readFileSync(homeNote, 'utf8'),
                homeBefore,
                'a note the reader had switched off was rewritten'
            );
        } finally {
            clearGroupRollbackForTesting();
            showInfoStub.restore();
            fs.rmSync(workNote, { force: true });
            fs.rmSync(homeNote, { force: true });
        }
    });

    test('one directory leaves the rows unmarked, exactly as before', async function () {
        this.timeout(15000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDirs', [workRoot], vscode.ConfigurationTarget.Workspace);
        execFileStub.callsFake(
            makeExtractorFake({ day: [singleDay], week: [singleDay], month: [singleDay], tasks: [], holidays: [] })
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.deepStrictEqual(info.collectionMarks, []);
        // No row of chips either: with one directory there is nothing to turn
        // off that would leave anything on screen.
        assert.deepStrictEqual(info.collectionChips, []);
    });
});
