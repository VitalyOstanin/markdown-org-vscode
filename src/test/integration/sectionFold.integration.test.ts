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
import { waitForAgendaRender, waitUntil } from './_helpers';

/**
 * Folding a section away.
 *
 * The whole feature only exists in the running page: the state is held there,
 * and what a press produces is the view rendered around it. What these tests
 * watch is the count of rows the page is showing -- a folded section leaves its
 * rows OUT of the render rather than hiding them, which is what keeps the
 * week's clipping chips honest, and nothing but a real render proves it.
 */
suite('Folding an agenda section', () => {
    const root = path.join(__dirname, '../../test-workspace-section-fold');
    const notes = path.join(root, 'notes.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    /** What `workspaceDir` was before this suite pointed it at its own notes. */
    let previousWorkspaceDir: string | undefined;

    /** A task of the given bucket, distinct enough to be counted. */
    function task(heading: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            file: notes,
            line: 1,
            heading,
            content: '',
            task_type: 'TODO',
            timestamp_type: 'SCHEDULED',
            ...extra
        };
    }

    /** One timed task, two all-day ones, three long-overdue ones. */
    function day(date: string): Record<string, unknown> {
        return {
            date,
            overdue: [
                task('Renew the passport', { days_offset: -800 }),
                task('Reply to the letter', { days_offset: -700 }),
                task('Sort the photos', { days_offset: -600 })
            ],
            scheduled_timed: [task('Standup')],
            scheduled_no_time: [task('Water the plants'), task('Take out the bins')],
            upcoming: []
        };
    }

    const oneDay = day('2026-08-14');
    const week = [day('2026-08-14'), day('2026-08-15')];
    const tasks = [
        { file: notes, line: 1, heading: 'Pay the bill', content: '', task_type: 'TODO', priority: 'A' },
        { file: notes, line: 2, heading: 'Book the tickets', content: '', task_type: 'TODO', priority: 'A' },
        { file: notes, line: 3, heading: 'Read the manual', content: '', task_type: 'TODO' }
    ];

    /**
     * Open a view and wait for THIS suite's rows to be the ones on screen.
     *
     * The mode alone is not enough to wait on: a panel left open by an earlier
     * suite already answers in the same mode, and a press sent to it lands in a
     * page that is about to be replaced -- which is exactly the flake this
     * waits out. `rows` is what this suite's payload renders to.
     */
    async function render(mode: 'day' | 'week' | 'tasks', rows: number): Promise<void> {
        const command =
            mode === 'tasks' ? 'markdown-org.showTasks' : `markdown-org.showAgenda${mode === 'day' ? 'Day' : 'Week'}`;
        await vscode.commands.executeCommand(command);
        await waitForAgendaRender(mode);
        await waitUntil(async () => (await snapshot()).taskRows === rows, `the ${mode} view showing ${rows} rows`);
    }

    /** The rendered snapshot, with the page's own assertion that it is there. */
    async function snapshot(): Promise<{ sectionFolds: string[]; taskRows: number; sections: string[] }> {
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'the panel answered no snapshot');
        return info;
    }

    /** Press a head and wait for the render it triggers to reach the page. */
    async function fold(section: string, rows: number): Promise<void> {
        await AgendaPanel.clickSectionFoldForTesting(section);
        await waitUntil(async () => (await snapshot()).taskRows === rows, `${section} pressed, leaving ${rows} rows`);
    }

    before(() => {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(notes, '## TODO Something\n', 'utf8');
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
        execFileStub.callsFake(makeExtractorFake({ day: [oneDay], week, month: [oneDay], tasks, holidays: [] }));
    });

    afterEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', previousWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'auto', vscode.ConfigurationTarget.Workspace);
        await config.update('agendaGrouping', undefined, vscode.ConfigurationTarget.Workspace);
        execFileStub.restore();
        resolveExtractorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('a folded section keeps its head and gives up its rows', async function () {
        this.timeout(20000);
        await render('day', 6);

        const before = await snapshot();
        assert.deepStrictEqual(before.sectionFolds, ['scheduled', 'allday', 'overdue-long']);

        await fold('allday', 4);

        const folded = await snapshot();
        // The head stays and says it is folded: a section that vanished would
        // leave the reader with no way back and no sign there was anything.
        assert.deepStrictEqual(folded.sectionFolds, ['scheduled', 'allday (folded)', 'overdue-long']);
        assert.ok(folded.sections.includes('All-day & upcoming'), folded.sections.join(', '));
    });

    test('a second press brings the rows back', async function () {
        this.timeout(20000);
        await render('day', 6);
        await fold('overdue-long', 3);

        await fold('overdue-long', 6);

        assert.deepStrictEqual((await snapshot()).sectionFolds, ['scheduled', 'allday', 'overdue-long']);
    });

    test('a band folded in the week view folds on every day of it', async function () {
        this.timeout(20000);
        await render('week', 12);

        const before = await snapshot();
        // Two days, each with a heading for the same three bands -- the timed
        // rows included, since the band is named for the hour a task is set
        // for rather than for the day it falls on.
        assert.deepStrictEqual(before.sectionFolds, [
            'scheduled',
            'allday',
            'overdue-long',
            'scheduled',
            'allday',
            'overdue-long'
        ]);

        // Three rows per day, folded on both: the state is held by band, the
        // way the Android client holds it for a screen rather than per day.
        await fold('overdue-long', 6);

        const folded = await snapshot();
        assert.deepStrictEqual(folded.sectionFolds, [
            'scheduled',
            'allday',
            'overdue-long (folded)',
            'scheduled',
            'allday',
            'overdue-long (folded)'
        ]);
    });

    test('the week folds the timed band as well, now that it has a head to press', async function () {
        this.timeout(20000);
        await render('week', 12);

        // One timed row per day: folding the band takes both away and leaves
        // the other five of each day standing.
        await fold('scheduled', 10);

        const folded = await snapshot();
        assert.deepStrictEqual(folded.sectionFolds, [
            'scheduled (folded)',
            'allday',
            'overdue-long',
            'scheduled (folded)',
            'allday',
            'overdue-long'
        ]);
    });

    test('the tasks view folds its priority groups too', async function () {
        this.timeout(20000);
        await render('tasks', 3);

        assert.deepStrictEqual((await snapshot()).sectionFolds, ['pa', 'pnone']);

        await fold('pa', 1);

        assert.deepStrictEqual((await snapshot()).sectionFolds, ['pa (folded)', 'pnone']);
    });

    test('a day without headings has nothing to fold, and shows every row', async function () {
        this.timeout(20000);
        // `flat` drops the headings, and with them the only control that could
        // bring a folded section back: a day with nothing to unfold by must
        // show what it has.
        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('agendaGrouping', 'flat', vscode.ConfigurationTarget.Workspace);
        await render('day', 6);

        assert.deepStrictEqual((await snapshot()).sectionFolds, []);
    });
});
