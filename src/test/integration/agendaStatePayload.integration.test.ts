import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as sinon from 'sinon';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';
import { makeExtractorFake } from '../_execFake';
import { waitForAgendaRender } from './_helpers';

/**
 * The page is filled from two payloads -- `init` for a panel that was just
 * built, `update` for one already on screen -- and both carry the same state.
 * A field that reaches only one of them is the hazard here: the panel looks
 * right when it is opened and wrong when it is refreshed, or the other way
 * round, and nothing but a user notices.
 *
 * So the suite never asserts what the page should show. It renders the same
 * settings twice -- once into a fresh panel, once into an open one -- and
 * requires the two to agree. Whatever the correct rendering is, both paths must
 * arrive at it.
 */
suite('Agenda state payload: an update lands where a fresh panel would', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-state-payload.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    const task = { file: testFile, line: 1, heading: 'Task', content: '', task_type: 'TODO' };
    const ANCHOR = '2026-01-05';

    const month = [{ date: '2026-01-01' }, { date: ANCHOR, scheduled_no_time: [task] }];

    /** The part of the snapshot that describes state rather than geometry. */
    interface PageState {
        mode: string;
        dayHeaders: (string | null)[];
        dayNumbers: (string | null)[];
        heroSub: string;
        sections: (string | null)[];
        headerLayout: string;
    }

    before(() => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        fs.writeFileSync(testFile, '## TODO Task\n');
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'auto', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(
            makeExtractorFake({
                day: [{ date: ANCHOR, scheduled_no_time: [task] }],
                week: [{ date: ANCHOR, scheduled_no_time: [task] }],
                month,
                tasks: [task],
                holidays: []
            })
        );

        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        for (const key of ['dateLocale', 'firstDayOfWeek', 'agendaGrouping']) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
        }
        execFileStub.restore();
        resolveExtractorStub.restore();
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    async function snapshotState(): Promise<PageState> {
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected an open AgendaPanel to snapshot');
        return {
            mode: info.mode,
            dayHeaders: info.dayHeaders,
            dayNumbers: info.dayNumbers,
            heroSub: info.heroSub,
            sections: info.sections,
            headerLayout: info.headerLayout
        };
    }

    /** Render the month view of `ANCHOR` into whatever panel state we are in. */
    async function renderMonth(): Promise<PageState> {
        await vscode.commands.executeCommand('markdown-org.showAgendaMonth', ANCHOR);
        await waitForAgendaRender('month');
        return snapshotState();
    }

    /** The same for the day view, which is where the section headings live. */
    async function renderDay(): Promise<PageState> {
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', ANCHOR);
        await waitForAgendaRender('day');
        return snapshotState();
    }

    async function setSetting(key: string, value: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update(key, value, vscode.ConfigurationTarget.Workspace);
    }

    // Each case names a setting the host re-sends on every render, and a value
    // that changes what the page draws -- otherwise the two snapshots would
    // agree no matter what the payload handler does.
    const CASES = [
        {
            what: 'the date locale',
            key: 'dateLocale',
            value: 'ar-EG'
        },
        {
            what: 'the first day of the week',
            key: 'firstDayOfWeek',
            value: 'sunday'
        }
    ];

    for (const { what, key, value } of CASES) {
        test(`${what} reaches an open panel exactly as it reaches a new one`, async function () {
            this.timeout(30000);

            // The update path: a panel is already on screen when the setting
            // changes, so the page is patched rather than built.
            const base = await renderMonth();
            await setSetting(key, value);
            const updated = await renderMonth();

            // The init path: the same setting, but the panel is built from
            // nothing. Closing the panel disposes it, which is what makes the
            // next render an `init`.
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            const opened = await renderMonth();

            assert.deepStrictEqual(
                updated,
                opened,
                `${what}="${value}" reached a fresh panel and an updated one differently`
            );
            // Only meaningful if the setting shows on the page at all: were it
            // invisible here, the comparison above would hold for any payload
            // handler, including one that ignores the field entirely.
            assert.notDeepStrictEqual(
                opened,
                base,
                `${what}="${value}" changes nothing this snapshot can see, so the case proves nothing`
            );
        });
    }

    // Its own test rather than another entry in CASES: the month grid has no
    // section headings to drop, so the setting has to be watched where they
    // are drawn.
    test('the grouping reaches an open panel exactly as it reaches a new one', async function () {
        this.timeout(30000);

        const base = await renderDay();
        assert.ok(base.sections.length > 0, 'expected the grouped day to name its sections');

        await setSetting('agendaGrouping', 'flat');
        const updated = await renderDay();

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        const opened = await renderDay();

        assert.deepStrictEqual(updated, opened, 'flat grouping reached a fresh panel and an updated one differently');
        assert.deepStrictEqual(opened.sections, [], 'a flat day names no section');
    });
});
