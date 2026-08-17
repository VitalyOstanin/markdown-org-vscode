import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as sinon from 'sinon';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { formatDayHeaderParts } from '../../utils/agendaDayHeader';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';
import { makeExtractorFake } from '../_execFake';
import { waitForAgendaRender, waitForHeaderLayout, waitForValue, waitUntil } from './_helpers';

suite('Agenda Show Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-show.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    const fullDay = {
        date: '2025-12-09',
        overdue: [],
        scheduled_timed: [{ file: testFile, line: 1, heading: 'Task', content: '', task_type: 'TODO' }],
        scheduled_no_time: [],
        upcoming: []
    };

    // Week / month payloads intentionally omit some buckets — this is what
    // markdown-org-extract emits when a bucket is empty in these modes, and
    // was the trigger for the v0.3.0 "Cannot read properties of undefined
    // (reading 'filter')" regression.
    const sparseWeek = [
        { date: '2025-12-08', scheduled_timed: [fullDay.scheduled_timed[0]] },
        { date: '2025-12-09', scheduled_no_time: [], overdue: [], upcoming: [] }
    ];

    const sparseMonth = [
        { date: '2025-12-01' },
        { date: '2025-12-15', scheduled_no_time: [fullDay.scheduled_timed[0]] }
    ];

    // Mixed priorities (and one task without a cookie) so the Tasks card has
    // several groups to order; `B` is deliberately absent to prove empty groups
    // are dropped rather than rendered as a "(0)" panel.
    const tasksPayload = [
        { file: testFile, line: 1, heading: 'Task', content: '', task_type: 'TODO', priority: 'A' },
        { file: testFile, line: 3, heading: 'Third', content: '', task_type: 'TODO', priority: 'C' },
        { file: testFile, line: 5, heading: 'Plain', content: '', task_type: 'TODO' }
    ];

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
        // The UI language would otherwise leak between tests: every assertion
        // on rendered labels below expects the English dictionary.
        await config.update('uiLanguage', 'auto', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');

        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(
            makeExtractorFake({
                day: [fullDay],
                week: sparseWeek,
                month: sparseMonth,
                tasks: tasksPayload,
                holidays: []
            })
        );

        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
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

    function assertNoError() {
        const calls = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.deepStrictEqual(calls, [], `showErrorMessage was called: ${calls.join('; ')}`);
    }

    test('Show Agenda (Day) loads without error', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');
        assertNoError();
        // Lock in the contract with markdown-org-extract: paths must come
        // back absolute so the openTask handler can pass them straight to
        // `vscode.workspace.openTextDocument`.
        const agendaCall = execFileStub.getCalls().find((c) => (c.args[1] as string[]).includes('--agenda'));
        assert.ok(agendaCall, 'expected an --agenda invocation');
        assert.ok(
            (agendaCall.args[1] as string[]).includes('--absolute-paths'),
            `extractor args missing --absolute-paths: ${(agendaCall.args[1] as string[]).join(' ')}`
        );
    });

    // The extractor derives "today" (overdue/upcoming buckets, timestamp_next)
    // from --current-date, and falls back to its own --tz default of
    // Europe/Moscow when the flag is absent. --date is the window anchor and
    // moves with Prev/Next, so it cannot stand in for "today": without this
    // flag a user east or west of Moscow gets the neighbouring day's agenda.
    test('the agenda invocation pins "today" with --current-date, independently of the window anchor', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
        await waitForAgendaRender('day');
        assertNoError();
        const agendaCall = execFileStub.getCalls().find((c) => (c.args[1] as string[]).includes('--agenda'));
        assert.ok(agendaCall, 'expected an --agenda invocation');
        const args = agendaCall.args[1] as string[];
        const currentDateIndex = args.indexOf('--current-date');
        assert.notStrictEqual(currentDateIndex, -1, `extractor args missing --current-date: ${args.join(' ')}`);
        assert.match(args[currentDateIndex + 1]!, /^\d{4}-\d{2}-\d{2}$/);
        // The anchor stays the requested date, so the two flags carry different
        // values here -- which is exactly why both are needed.
        const dateIndex = args.indexOf('--date');
        assert.strictEqual(args[dateIndex + 1], '2025-12-09');
        assert.notStrictEqual(args[currentDateIndex + 1], '2025-12-09');
    });

    // The month view draws whole weeks, so it asks for whole weeks: the grid
    // scope answers with the days the calendar actually shows, padding
    // included, and the week it starts on is the setting's rather than the
    // extractor's fixed Monday default. Asking for `month` and padding the
    // grid here left those cells without data -- a task on 30 November was
    // missing from December's first cell.
    test('the month view asks the extractor for the grid it draws', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaMonth', '2025-12-09');
        await waitForAgendaRender('month');
        assertNoError();
        const agendaCall = execFileStub.getCalls().find((c) => (c.args[1] as string[]).includes('--agenda'));
        assert.ok(agendaCall, 'expected an --agenda invocation');
        const args = agendaCall.args[1] as string[];
        assert.strictEqual(args[args.indexOf('--agenda') + 1], 'month-grid');
        const weekStartIndex = args.indexOf('--week-start');
        assert.notStrictEqual(weekStartIndex, -1, `extractor args missing --week-start: ${args.join(' ')}`);
        // Never `auto`: the extractor reads no locale, so the setting is
        // resolved to a weekday before it gets here.
        assert.ok(
            ['monday', 'sunday'].includes(args[weekStartIndex + 1] ?? ''),
            `--week-start must name a weekday, got ${args[weekStartIndex + 1]}`
        );
    });

    test('the first-day-of-week setting is what the extractor is told', async function () {
        this.timeout(10000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        try {
            await config.update('firstDayOfWeek', 'sunday', vscode.ConfigurationTarget.Workspace);
            await vscode.commands.executeCommand('markdown-org.showAgendaMonth', '2025-12-09');
            await waitForAgendaRender('month');
            const agendaCall = execFileStub.getCalls().find((c) => (c.args[1] as string[]).includes('--week-start'));
            assert.ok(agendaCall, 'expected a --week-start invocation');
            const args = agendaCall.args[1] as string[];
            assert.strictEqual(args[args.indexOf('--week-start') + 1], 'sunday');
        } finally {
            await config.update('firstDayOfWeek', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    // The cells are the payload's days, so a date from the neighbouring month
    // is drawn -- and drawn with what it carries -- instead of being rebuilt
    // empty by the page.
    test('a grid day outside the anchor month is rendered as a cell of its own', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaMonth', '2025-12-09');
        await waitForAgendaRender('month');
        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaMonth');
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected rendered info from the open panel');
        assert.deepStrictEqual(
            info.calendarDates,
            sparseMonth.map((d) => d.date),
            'the grid must show the days the payload carries, in their order'
        );
    });

    test('Show Agenda (Week) loads sparse payload without error', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');
        assertNoError();
    });

    // A week holds enough rows that finding one by eye is the slow part, and
    // the editor already has a find widget for exactly that -- but a webview
    // panel gets it only when it asks. The option defaults to false, so this
    // states the intent rather than the default.
    test('the panel carries the find widget, so Ctrl+F searches the rendered agenda', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        const panel = (AgendaPanel as unknown as { currentPanel?: vscode.WebviewPanel }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open');
        assert.strictEqual(panel.options.enableFindWidget, true);
    });

    // The widget above is only half of it: opening the panel focuses the
    // webview element, not the document inside it, so Ctrl+F went nowhere
    // until a click landed somewhere in the agenda. The page takes the focus
    // itself now, on the render that follows a user-initiated show.
    test('the page takes the keyboard focus on show, so Ctrl+F needs no click first', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.strictEqual(info.focusedTag, 'BODY');
    });

    // A render that throws used to leave the panel blank and the user with
    // nothing to go on: the exception reaches only the webview console, and the
    // ready handshake (sent when the script starts, before any render) had
    // already told the retry watchdog the panel was fine. The webview now
    // reports the failure to the host, which surfaces it.
    test('a payload the renderer cannot handle is reported, not left as a blank panel', async function () {
        this.timeout(15000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');
        assertNoError();

        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open');
        // An empty dictionary is the shape of a real failure mode (a host and a
        // page that disagree about the strings contract): the nav bar reads
        // UI.modes.day and throws on it.
        await panel.webview.postMessage({
            command: 'init',
            data: [],
            mode: 'week',
            locale: 'en-US',
            shiftedToday: '2025-12-09',
            currentTag: 'ALL',
            availableTags: ['ALL'],
            holidays: [],
            firstDayOfWeek: 'monday',
            language: 'en',
            strings: {}
        });

        await waitUntil(() => showErrorStub.called, 'a render failure to be reported', 4000);
        const messages = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.ok(
            messages.some((m) => m.includes('Agenda failed to render')),
            `expected a render failure to be reported, got: ${messages.join('; ') || '(no message)'}`
        );
    });

    test('Show Agenda (Month) loads sparse payload without error', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaMonth');
        await waitForAgendaRender('month');
        assertNoError();
    });

    test('Show Tasks loads without error', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showTasks');
        await waitForAgendaRender('tasks');
        assertNoError();
    });

    test('Day → Week → Month → Tasks switch keeps the panel alive', async function () {
        this.timeout(15000);
        for (const cmd of [
            'markdown-org.showAgendaDay',
            'markdown-org.showAgendaWeek',
            'markdown-org.showAgendaMonth',
            'markdown-org.showTasks'
        ]) {
            await vscode.commands.executeCommand(cmd);
            await waitForAgendaRender(
                cmd === 'markdown-org.showTasks' ? 'tasks' : cmd.replace('markdown-org.showAgenda', '').toLowerCase()
            );
        }
        assertNoError();
    });

    // Verify the webview actually produced day-header elements with the
    // dates that the extractor returned. assertNoError() (above) catches
    // host-side throws but does NOT catch ReferenceError inside the webview
    // iframe -- those errors surface only as a missing DOM. These tests
    // close the gap by querying the rendered DOM via getRenderedInfo.
    test('Day mode renders a single day-header with the requested anchor date', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
        await waitForAgendaRender('day');
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showAgendaDay');
        assert.strictEqual(info.mode, 'day');
        assert.deepStrictEqual(info.dayHeaders, ['2025-12-09']);
    });

    test('Week mode renders day-headers for every date in the payload, even sparse entries', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek', '2025-12-09');
        await waitForAgendaRender('week');
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showAgendaWeek');
        assert.strictEqual(info.mode, 'week');
        // sparseWeek above contains '2025-12-08' (with one task) and
        // '2025-12-09' (with all four buckets empty). Both dates still need
        // their own .day-header rendered in the DOM.
        assert.deepStrictEqual(info.dayHeaders, ['2025-12-08', '2025-12-09']);
    });

    // Day and Tasks both render as a card: a summary bar plus section panels.
    // The panel titles come from buildDaySections / buildTaskGroups (unit
    // tested); these two tests prove the cards actually reach the DOM and keep
    // their order, which a webview-side ReferenceError would silently break.
    test('Day mode renders section panels for the buckets it received', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
        await waitForAgendaRender('day');
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showAgendaDay');
        // fullDay carries a single scheduled-with-time task; the empty
        // all-day/overdue buckets must not produce panels.
        assert.deepStrictEqual(info.sections, ['At a set time']);
    });

    test('Tasks mode groups by priority, highest first and backlog last', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showTasks');
        await waitForAgendaRender('tasks');
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showTasks');
        assert.strictEqual(info.mode, 'tasks');
        assert.deepStrictEqual(info.sections, ['Priority A', 'Priority C', 'No priority']);
        // The date-less Tasks card has no anchor date, so its summary bar
        // carries no data-date (unlike the Day card's).
        assert.deepStrictEqual(info.dayHeaders, []);
    });

    // Numbers on the panel follow the date locale's numbering system, like the
    // dates they sit next to. The year used to be printed as a raw JS number,
    // so under ar-EG the hero read "٥ يناير 2026" while the day header below it
    // was fully Arabic-Indic; the month grid had the same split between its
    // Intl weekday row and its ASCII cell numbers.
    test('dateLocale=ar-EG renders the year and the calendar numbers in the locale digits', async function () {
        this.timeout(15000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('dateLocale', 'ar-EG', vscode.ConfigurationTarget.Workspace);
        try {
            await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2026-01-05');
            await waitForAgendaRender('day');
            const day = await AgendaPanel.queryRenderedInfoForTesting();
            assert.ok(day, 'expected AgendaPanel to be open after showAgendaDay');
            const expectedYear = formatDayHeaderParts('2026-01-05', 'ar-EG').year;
            assert.ok(
                day.heroSub.includes(expectedYear),
                `hero subtitle "${day.heroSub}" should carry the localized year "${expectedYear}"`
            );
            assert.ok(!/[0-9]/.test(day.heroSub), `hero subtitle "${day.heroSub}" still contains ASCII digits`);

            await vscode.commands.executeCommand('markdown-org.showAgendaMonth', '2026-01-05');
            await waitForAgendaRender('month');
            const month = await AgendaPanel.queryRenderedInfoForTesting();
            assert.ok(month, 'expected AgendaPanel to be open after showAgendaMonth');
            assert.ok(month.dayNumbers.length > 0, 'expected the month grid to render day numbers');
            const ascii = month.dayNumbers.filter((n) => /[0-9]/.test(n));
            assert.deepStrictEqual(ascii, [], 'calendar day numbers still contain ASCII digits');
        } finally {
            await config.update('dateLocale', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    // markdown-org.uiLanguage drives the labels the webview renders. This
    // proves the dictionary actually reaches the DOM (the strings are injected
    // into the webview and reassigned on every init/update), not just that the
    // resolver returns the right language.
    test('uiLanguage=ru renders the card labels in Russian', async function () {
        this.timeout(10000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('uiLanguage', 'ru', vscode.ConfigurationTarget.Workspace);

        await vscode.commands.executeCommand('markdown-org.showTasks');
        await waitForAgendaRender('tasks');
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showTasks');
        assert.deepStrictEqual(info.sections, ['Приоритет A', 'Приоритет C', 'Без приоритета']);
    });

    test('uiLanguage=en keeps the card labels in English regardless of the date locale', async function () {
        this.timeout(10000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('uiLanguage', 'en', vscode.ConfigurationTarget.Workspace);
        await config.update('dateLocale', 'ru-RU', vscode.ConfigurationTarget.Workspace);

        try {
            await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
            await waitForAgendaRender('day');
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            assert.ok(info, 'expected AgendaPanel to be open after showAgendaDay');
            assert.deepStrictEqual(info.sections, ['At a set time']);
        } finally {
            await config.update('dateLocale', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    // markdown-org.agendaHeaderMode. `compact` and `full` pin the layout; the
    // default `auto` decides from the panel height, which a headless test cannot
    // set, so the two pinned values are what is asserted here. The class lands
    // on <body>, and the page reports which one it settled on.
    test('agendaHeaderMode=compact renders the compact header, full renders the tall one', async function () {
        this.timeout(15000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        try {
            await config.update('agendaHeaderMode', 'compact', vscode.ConfigurationTarget.Workspace);
            await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
            await waitForAgendaRender('day');
            const compact = await AgendaPanel.queryRenderedInfoForTesting();
            assert.ok(compact, 'expected AgendaPanel to be open after showAgendaDay');
            assert.strictEqual(compact.headerLayout, 'compact');
            // What the setting actually promises (package.json, README): the
            // title moves onto the control row. The class alone does not prove
            // that -- an inert `order` on a non-flex parent leaves the hero on
            // its own line while the class says "compact" -- so the page
            // measures the two boxes and reports whether they overlap.
            assert.strictEqual(
                compact.heroSharesControlRow,
                true,
                'compact header must place the hero title on the control row, not merely shrink it'
            );

            // Changing the setting must reach the open panel: unlike the font
            // stack this rides on a message instead of a shell rebuild, so a
            // missing listener would leave the panel on the old layout until it
            // was reopened.
            await config.update('agendaHeaderMode', 'full', vscode.ConfigurationTarget.Workspace);
            await waitForHeaderLayout('full');
            const full = await AgendaPanel.queryRenderedInfoForTesting();
            assert.ok(full, 'expected AgendaPanel to stay open after the setting change');
            assert.strictEqual(
                full.heroSharesControlRow,
                false,
                'full header must keep the hero title on its own line above the controls'
            );
        } finally {
            await config.update('agendaHeaderMode', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    // The control row carries a chip that cycles the same setting, and the
    // command behind it is what the chip posts back -- so the palette and the
    // click leave the same value behind. Without the chip the setting is only
    // reachable from the settings editor, which is the most awkward place to
    // go from a panel too short to show its tasks.
    test('the header-layout chip and its command cycle auto -> full -> compact', async function () {
        this.timeout(20000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        try {
            await config.update('agendaHeaderMode', 'auto', vscode.ConfigurationTarget.Workspace);
            await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
            await waitForAgendaRender('day');
            const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
            assert.ok(panel, 'expected AgendaPanel to be open after showAgendaDay');
            assert.ok(
                panel.webview.html.includes("command: 'cycleHeaderMode'"),
                'expected the control row to carry a chip that posts cycleHeaderMode'
            );

            await vscode.commands.executeCommand('markdown-org.cycleAgendaHeaderMode');
            await waitForHeaderLayout('full');
            assert.strictEqual(vscode.workspace.getConfiguration('markdown-org').get('agendaHeaderMode'), 'full');

            await vscode.commands.executeCommand('markdown-org.cycleAgendaHeaderMode');
            await waitForHeaderLayout('compact');
            assert.strictEqual(vscode.workspace.getConfiguration('markdown-org').get('agendaHeaderMode'), 'compact');

            // Third step returns to auto, which is what keeps the automatic
            // behaviour reachable from the panel.
            await vscode.commands.executeCommand('markdown-org.cycleAgendaHeaderMode');
            assert.strictEqual(vscode.workspace.getConfiguration('markdown-org').get('agendaHeaderMode'), 'auto');
        } finally {
            await config.update('agendaHeaderMode', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    // CANCELLED/CANCELED styling. The per-task status class is computed
    // client-side inside the inlined `renderTask` function, so the generated
    // webview HTML carries the renderTask SOURCE plus the AGENDA_STYLES CSS,
    // not the rendered <span class="status" data-status="cancelled"> markup.
    // The most meaningful seam without a live DOM harness is therefore the
    // webview `html` string itself: it must contain (a) the CSS that marks a
    // cancelled task -- a grey status dot and a struck-through heading -- and
    // (b) the two-spelling branch in the renderTask source, while keeping the
    // CSP/escape invariants intact (see CLAUDE.md "Безопасность webview").
    test('webview HTML carries the cancelled-task styling and renderTask branch', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
        await waitForAgendaRender('day');
        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaDay');
        const html = panel.webview.html;

        // (a) The CSS that visually distinguishes a cancelled task must be in
        // the injected styles: the status is a coloured dot (painted by
        // attention level, not by the status text) and the heading is greyed
        // out and struck through.
        assert.ok(
            html.includes('.status[data-attention="cancelled"]::before'),
            'expected the cancelled status-dot rule to be injected into the webview'
        );
        assert.ok(
            html.includes('.task-line[data-status="cancelled"] .heading'),
            'expected the cancelled-heading rule to be injected into the webview'
        );
        assert.ok(html.includes('text-decoration: line-through'), 'expected the cancelled task to be struck through');

        // (b) The cancelled-spelling check is shared with host code: the
        // `isCancelled` helper (which knows both 'CANCELLED' two L and
        // 'CANCELED' one L) is inlined into the webview and used by renderTask,
        // so the spelling list cannot drift from the regex/toggle/normalizer.
        // The helper's own spelling coverage is unit-tested in
        // normalizeTaskType.test.ts.
        assert.ok(
            html.includes("status === 'CANCELLED' || status === 'CANCELED'"),
            'expected the inlined isCancelled source (both spellings) to be present in the webview'
        );
        assert.ok(
            html.includes("isCancelled(status) ? 'cancelled'"),
            'expected renderTask to assign the cancelled statusKind via the shared isCancelled helper'
        );

        // CSP/escape invariants must still hold: the security meta tag is
        // present and the status text is still rendered via escapeHtml (no
        // raw interpolation was introduced).
        assert.ok(html.includes('http-equiv="Content-Security-Policy"'), 'expected the CSP meta tag to remain present');
        assert.ok(
            html.includes('escapeHtml(status)'),
            'expected the status text to remain escaped via escapeHtml(status)'
        );
    });

    // The injected script ends with `(agendaClientMain source)(bootstrap, { helper, ... })`,
    // where the helper names are the KEYS of AgendaPanel.INLINED_HELPERS while the
    // declarations above them come from each function's own `.toString()`. Those two
    // agree only as long as every key is spelled like the function it holds -- a
    // renamed import (`import { escapeHtml as esc }`) would emit `esc` in the
    // argument list and `function escapeHtml` in the body, and the page would die on
    // an undefined name at load. The check derives the list from the emitted HTML, so
    // it stays in step with the contract instead of restating it.
    test('every helper handed to the webview client is also declared in the script', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
        await waitForAgendaRender('day');
        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaDay');
        const html = panel.webview.html;

        // The call that starts the client: `})({"strings":...}, { a, b, ... });`
        // -- the whole of it on the script's last line. Anchored to the `)(`
        // that applies the stringified client, because a helper body may well
        // contain `}, { name })` of its own (a ctx argument, say).
        const depsCall = /\)\(\{.*\}, \{ ([A-Za-z0-9_, ]+) \}\);/.exec(html);
        assert.ok(depsCall, 'expected the script to call the client with a shorthand helper object');
        const names = depsCall[1]!.split(',').map((n) => n.trim());
        assert.ok(names.length >= 20, `expected the full helper set, got ${names.length}: ${names.join(', ')}`);
        for (const name of names) {
            assert.ok(
                html.includes(`function ${name}(`),
                `helper "${name}" is passed to the client but never declared in the injected script`
            );
        }

        // The client itself is inlined, not merely referenced: its ready
        // handshake is what stops the ServiceWorker-race retry from firing.
        assert.ok(
            html.includes("postMessage({ command: 'ready' })"),
            'expected the inlined client body to contain the ready handshake'
        );

        // Only the function bodies travel, so a body that reads anything from
        // its module -- an exported const used as a default parameter, say --
        // arrives as `exports.NAME` and kills the page with "exports is not
        // defined" on load. The CommonJS emit spells every such reference that
        // way, which makes the string a reliable tripwire.
        assert.ok(
            !/\bexports\./.test(html),
            'inlined sources must not reference module exports (they are undefined in the page)'
        );

        // The same hazard from the other side: a body that CALLS an import
        // arrives as `moduleName_1.fn(...)`, the alias the CommonJS emit gives
        // every imported module. `formatDayHeaderParts` once picked up a helper
        // that way and the page died with "regexGroups_1 is not defined".
        const importAlias = /\b([A-Za-z_$][\w$]*)_\d+\./.exec(html);
        assert.ok(
            !importAlias,
            `inlined sources must not call imports (they are undefined in the page); found ${importAlias?.[0]}`
        );
    });

    // #content comes from the HTML shell and only ever has its innerHTML
    // replaced, so it outlives every render. Subscribing to it per render used
    // to stack a closure each time, and after N refreshes (one per save of a
    // watched file) one click posted N openTask messages and opened the editor
    // N times. The wiring must therefore appear exactly once in the script.
    test('the task-click handler is wired once, not per render', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek', '2025-12-09');
        await waitForAgendaRender('week');
        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaWeek');
        const occurrences = panel.webview.html.split("command: 'openTask'").length - 1;
        assert.strictEqual(occurrences, 1, `expected a single openTask sender in the script, found ${occurrences}`);
    });

    // The panel's clickable surfaces are <button>s rather than <div>s with a
    // click handler: that is what gives them Tab focus and Enter/Space, so the
    // whole header and the month grid stay usable without a mouse. The markup
    // is built in the page, so the injected script is what the check reads.
    test('clickable panel surfaces are rendered as buttons', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaMonth', '2025-12-09');
        await waitForAgendaRender('month');
        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaMonth');
        const script = panel.webview.html;

        for (const cls of ['calendar-day', 'tag-menu-item', 'seg-item']) {
            assert.strictEqual(
                script.includes(`<div class="${cls}`),
                false,
                `${cls} must be a <button>, not a clickable <div>`
            );
        }
        assert.ok(
            script.includes('<button type="button" class="tag-menu-item'),
            'expected the tag dropdown rows to be buttons'
        );
        // Every calendar cell goes through one opening-tag helper, which is
        // also where the drill-down tooltip is attached.
        // The helper is inlined at the top level of the script, so its body ends
        // at the first unindented closing brace.
        const cellTag = /function calendarCellOpenTag\([\s\S]*?\n\}/.exec(script);
        assert.ok(cellTag, 'expected calendarCellOpenTag in the injected script');
        assert.ok(cellTag[0].includes('<button type="button" class="'), 'calendar cells must be buttons');
        assert.ok(cellTag[0].includes('openDayView'), 'calendar cells must carry the drill-down tooltip');
    });

    // Two chips of the same component -- the month cell's task load and the
    // card section count -- must explain their number the same way. The month
    // one always did; the section one used to be a bare number.
    test('both count chips carry a tooltip', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
        await waitForAgendaRender('day');
        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaDay');
        const script = panel.webview.html;
        assert.ok(
            script.includes('<span class="day-section-count" title="'),
            'the section count chip must carry a tooltip'
        );
        assert.ok(script.includes('countChip'), 'both chips must read their wording from the shared countChip strings');
    });

    // The view history is reached through commands and keybindings only: the
    // header carried a pair of arrows for it, and a second pair of arrows next
    // to the date navigation read as "previous day" rather than "back".
    test('the header carries no history buttons', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');
        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaWeek');
        const script = panel.webview.html;

        assert.ok(!script.includes('btn-history-back'), 'the Back button must be gone from the header');
        assert.ok(!script.includes('btn-history-forward'), 'the Forward button must be gone from the header');
    });

    test('the panel navigates history through its commands', async function () {
        this.timeout(15000);
        // Two view states, so Back has somewhere to go.
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');
        await vscode.commands.executeCommand('markdown-org.showAgendaMonth');
        await waitForAgendaRender('month');

        await vscode.commands.executeCommand('markdown-org.agendaBack');
        await waitForAgendaRender('week');

        await vscode.commands.executeCommand('markdown-org.agendaForward');
        await waitForAgendaRender('month');
    });
});

// The agenda lists every task that `markdown-org-extract` returns, regardless
// of where the file actually lives -- the extractor is a broad-search tool
// and is the source of truth for what is reachable. These tests pin the
// behaviour described in CLAUDE.md: any path coming through `openTask` must
// open, even when it points outside `workspaceFolders` or through a symlink.
suite('AgendaPanel.openTaskInEditor', () => {
    // Per-suite unique tmpdir via `mkdtemp` instead of a stable path:
    //   * each run lands in its own directory, so a residual file from a
    //     previous interrupted run on a dev machine does not affect the next;
    //   * the suite no longer needs an after-hook to remove the directory.
    //     On Windows the previous `rmSync` consistently tripped on EBUSY
    //     because VS Code holds a handle on the sandbox after the last editor
    //     closes, and bumping `maxRetries`/`retryDelay` only made the failure
    //     slower. Leaving tmpdir to the OS (CI runners discard the workspace
    //     after the job; dev tmpdir is reaped by the OS on its own schedule)
    //     trades a few stale kilobytes for a reliable signal.
    let sandboxDir: string;
    let showErrorStub: sinon.SinonStub;

    before(() => {
        sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-org-openTask-tests-'));
    });

    beforeEach(() => {
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    function assertOpened(expectedRealPath: string) {
        const calls = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.deepStrictEqual(calls, [], `showErrorMessage was called: ${calls.join('; ')}`);
        const active = vscode.window.activeTextEditor;
        assert.ok(active, 'no active editor after openTaskInEditor');
        const activePath = active.document.uri.fsPath;
        // Windows is case-insensitive at the filesystem level and VS Code
        // sometimes hands back paths with a lower-case drive letter while
        // `fs.realpathSync` uppercases it. Compare case-insensitively on
        // Windows so the assertion measures "same file" rather than "same
        // byte sequence".
        const normalize = (p: string) => {
            const real = fs.realpathSync(p);
            return process.platform === 'win32' ? real.toLowerCase() : real;
        };
        const actual = normalize(activePath);
        const expected = normalize(expectedRealPath);
        assert.strictEqual(actual, expected, `active editor points to ${actual}, expected ${expected}`);
    }

    test('opens a file located outside any VS Code workspace folder', async function () {
        this.timeout(10000);
        const target = path.join(sandboxDir, 'outside-workspace.md');
        fs.writeFileSync(target, '## TODO Outside workspace\n');
        try {
            await AgendaPanel.openTaskInEditor(target, 1);
            assertOpened(target);
        } finally {
            fs.unlinkSync(target);
        }
    });

    test('opens a file referenced via a symlink to a real file', async function () {
        this.timeout(10000);
        const realFile = path.join(sandboxDir, 'real.md');
        const symlinkFile = path.join(sandboxDir, 'symlink.md');
        fs.writeFileSync(realFile, '## TODO Symlinked file\n');
        // GitHub-hosted windows-latest runners execute jobs under an
        // administrator account, so `symlinkSync` works without enabling
        // Developer Mode. If a future runner image drops admin privileges,
        // this call will throw EPERM and the test will fail loudly --
        // which is the right signal to re-introduce a platform skip.
        fs.symlinkSync(realFile, symlinkFile);
        try {
            await AgendaPanel.openTaskInEditor(symlinkFile, 1);
            assertOpened(realFile);
        } finally {
            fs.unlinkSync(symlinkFile);
            fs.unlinkSync(realFile);
        }
    });

    test('surfaces an error for a non-existent file instead of failing silently', async function () {
        this.timeout(10000);
        const missing = path.join(sandboxDir, 'does-not-exist.md');
        await AgendaPanel.openTaskInEditor(missing, 1);
        const calls = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.strictEqual(calls.length, 1, 'expected exactly one error message');
        assert.ok(calls[0]!.includes('failed to open'), `unexpected error message: ${calls[0]}`);
    });
});

// When the agenda webview is focused, the user has no markdown editor in
// focus, so `editorTextFocus && editorLangId == markdown` evaluates false
// and the show/cycle keybindings would silently stop working. The fix:
// the panel toggles a custom when-context `markdown-org.agendaFocused`,
// and the keybindings include it in their when-clause. Editing commands
// (setTodo, insertScheduled, etc.) stay restricted to markdown editors
// on purpose -- they need an active TextEditor to operate on.
suite('Agenda webview keybindings scope', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-keybindings.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

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

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');

        const emptyDay = {
            date: '2026-05-17',
            overdue: [],
            scheduled_timed: [],
            scheduled_no_time: [],
            upcoming: []
        };

        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(
            makeExtractorFake({
                day: [emptyDay],
                week: [emptyDay],
                month: [emptyDay],
                tasks: [],
                holidays: []
            })
        );

        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
        execFileStub.restore();
        resolveExtractorStub.restore();
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        // Reset the custom context so it cannot leak into later suites.
        await vscode.commands.executeCommand('setContext', 'markdown-org.agendaFocused', false);
    });

    after(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    // The panel presents Day/Week/Month/Tasks as four equal segments, so all
    // four view commands carry a keybinding with the same scope -- Day and
    // Tasks used to have none, which left the two most reworked views
    // mouse-only.
    test('package.json: all four view commands are bound and reach the agenda panel', () => {
        const ext = vscode.extensions.getExtension('vitalyostanin.markdown-org-vscode');
        assert.ok(ext, 'extension not found');
        const keybindings: { command: string; key?: string; mac?: string; when?: string }[] =
            ext.packageJSON.contributes.keybindings;
        const views = [
            'markdown-org.showAgendaDay',
            'markdown-org.showAgendaWeek',
            'markdown-org.showAgendaMonth',
            'markdown-org.showTasks'
        ];
        for (const command of views) {
            const binding = keybindings.find((k) => k.command === command);
            assert.ok(binding, `${command} keybinding missing`);
            assert.ok(binding.key, `${command} keybinding has no key`);
            assert.ok(binding.mac, `${command} keybinding has no mac variant`);
            assert.ok(
                binding.when?.includes('markdown-org.agendaFocused'),
                `${command} when missing agendaFocused: ${binding.when}`
            );
        }
        // No two of them share a chord.
        const keys = views.map((c) => keybindings.find((k) => k.command === c)?.key);
        assert.strictEqual(new Set(keys).size, keys.length, `view commands share a chord: ${keys.join(', ')}`);
    });

    // History navigation used to be a keydown listener inside the page that
    // captured Alt+Shift+- / Alt+Shift+= and stopped propagation. That made the
    // shortcut invisible in Keyboard Shortcuts, impossible to rebind or
    // disable, and it swallowed whatever else the user had bound to those
    // chords while the agenda had focus. They are contributed keybindings now.
    test('package.json: history navigation is a contributed keybinding, scoped to the agenda', () => {
        const ext = vscode.extensions.getExtension('vitalyostanin.markdown-org-vscode');
        assert.ok(ext, 'extension not found');
        const keybindings: { command: string; key?: string; when?: string }[] = ext.packageJSON.contributes.keybindings;
        const back = keybindings.find((k) => k.command === 'markdown-org.agendaBack');
        const forward = keybindings.find((k) => k.command === 'markdown-org.agendaForward');
        assert.ok(back, 'agendaBack keybinding missing');
        assert.ok(forward, 'agendaForward keybinding missing');
        assert.strictEqual(back.key, 'alt+shift+-');
        assert.strictEqual(forward.key, 'alt+shift+=');
        for (const binding of [back, forward]) {
            assert.ok(
                binding.when?.includes('markdown-org.agendaFocused'),
                `${binding.command} must be scoped to the agenda, got: ${binding.when}`
            );
        }
    });

    test('overlapping history replays keep the forward tail', async function () {
        this.timeout(20000);
        // Three states, so there is a tail to lose.
        for (const date of ['2026-05-17', '2026-05-18', '2026-05-19']) {
            await vscode.commands.executeCommand('markdown-org.showAgendaDay', date);
            await waitForAgendaRender('day');
        }
        // Two Back invocations without awaiting the first: VS Code serialises
        // neither commands nor webview messages, so this is what a quick double
        // press looks like. With the old boolean flag the first replay to
        // finish cleared it mid-flight, the second render was recorded, and
        // recording drops everything ahead of the cursor.
        await Promise.all([
            vscode.commands.executeCommand('markdown-org.agendaBack'),
            vscode.commands.executeCommand('markdown-org.agendaBack')
        ]);
        await waitForAgendaRender('day');

        const history = (AgendaPanel as unknown as { history: { canGoForward(): boolean } }).history;
        assert.ok(history.canGoForward(), 'forward tail was dropped by overlapping replays');
    });

    test('package.json: cycleTag is scoped like every other binding -- markdown editor or agenda panel', () => {
        // It used to be the one binding with no `when` at all, so the chord was
        // live in every editor. The agenda clause is what keeps it working from
        // inside the panel, where there is no text editor to focus.
        const ext = vscode.extensions.getExtension('vitalyostanin.markdown-org-vscode');
        const keybindings: { command: string; when?: string }[] = ext!.packageJSON.contributes.keybindings;
        const cycle = keybindings.find((k) => k.command === 'markdown-org.cycleTag');
        assert.ok(cycle, 'cycleTag keybinding missing');
        assert.ok(cycle.when, 'cycleTag should carry the same when-clause as the rest');
        assert.ok(
            cycle.when.includes('markdown-org.agendaFocused'),
            `cycleTag must still work inside the agenda: ${cycle.when}`
        );
        assert.ok(
            cycle.when.includes('editorLangId == markdown'),
            `cycleTag should be scoped to markdown editors: ${cycle.when}`
        );
    });

    test('shiftedToday is reset when the agenda panel is disposed', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        const beforeClose = (AgendaPanel as unknown as { shiftedToday?: string }).shiftedToday;
        assert.ok(beforeClose, 'expected AgendaPanel.shiftedToday to be populated while the panel is open');

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await waitForValue(
            () => (AgendaPanel as unknown as { shiftedToday?: string }).shiftedToday,
            undefined,
            'shiftedToday to be cleared on dispose'
        );

        const afterClose = (AgendaPanel as unknown as { shiftedToday?: string }).shiftedToday;
        assert.strictEqual(
            afterClose,
            undefined,
            'AgendaPanel.shiftedToday must clear on dispose so AgendaPanel.refresh() cannot reuse a stale anchor when the panel reopens'
        );
    });

    test('agendaFocused context is set true on open and false on dispose', async function () {
        this.timeout(10000);
        const spy = sinon.spy(vscode.commands, 'executeCommand');
        try {
            await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
            await waitForAgendaRender('week');

            const focusCalls = spy
                .getCalls()
                .filter((c) => c.args[0] === 'setContext' && c.args[1] === 'markdown-org.agendaFocused');
            assert.ok(
                focusCalls.some((c) => c.args[2] === true),
                'expected setContext(markdown-org.agendaFocused, true) on open'
            );

            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await waitUntil(
                () =>
                    spy
                        .getCalls()
                        .some(
                            (c) =>
                                c.args[0] === 'setContext' &&
                                c.args[1] === 'markdown-org.agendaFocused' &&
                                c.args[2] === false
                        ),
                'setContext(agendaFocused, false) after the panel closed'
            );

            const afterClose = spy
                .getCalls()
                .filter((c) => c.args[0] === 'setContext' && c.args[1] === 'markdown-org.agendaFocused');
            assert.ok(
                afterClose.some((c) => c.args[2] === false),
                'expected setContext(markdown-org.agendaFocused, false) on dispose'
            );
        } finally {
            spy.restore();
        }
    });

    test('show* commands still work when no markdown editor is in focus', async function () {
        this.timeout(15000);
        // No markdown editor -- the agenda webview is the only thing open.
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');
        let tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(
            tab?.label.toLowerCase().includes('week'),
            `expected active tab to show week mode, got ${tab?.label}`
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaMonth');
        await waitForAgendaRender('month');
        tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(
            tab?.label.toLowerCase().includes('month'),
            `expected active tab to show month mode, got ${tab?.label}`
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');
        tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(tab?.label.toLowerCase().includes('day'), `expected active tab to show day mode, got ${tab?.label}`);

        await vscode.commands.executeCommand('markdown-org.showTasks');
        await waitForAgendaRender('tasks');
        tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(
            tab?.label.toLowerCase().includes('tasks'),
            `expected active tab to show tasks mode, got ${tab?.label}`
        );

        const errs = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.deepStrictEqual(errs, [], `showErrorMessage was called: ${errs.join('; ')}`);
    });

    test('Next Week click sends navigation=true so the webview scrolls to the top, not mid-week', async function () {
        this.timeout(15000);

        // Open the panel on the current week first.
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        const renderSpy = sinon.spy(AgendaPanel, 'render');
        try {
            // Imitate the Next Week button: the webview posts a `navigate`
            // message which the panel translates into `refreshCallback(date, true)`.
            // We invoke that callback directly because driving the real DOM
            // click would require a real webview test harness.
            const refreshCb = (
                AgendaPanel as unknown as {
                    refreshCallback?: (date?: string, userInitiated?: boolean) => Promise<void>;
                }
            ).refreshCallback;
            assert.ok(refreshCb, 'refreshCallback should be set after the panel opens');

            await refreshCb('2026-05-24', true);
            await waitUntil(() => renderSpy.callCount >= 1, 'render to be called from refreshCallback');

            assert.ok(renderSpy.callCount >= 1, 'expected AgendaPanel.render to be called from refreshCallback');
            const request = renderSpy.lastCall.args[0];
            assert.strictEqual(request.userInitiated, true, 'Next Week click should be userInitiated=true');
            assert.strictEqual(request.navigation, true, 'Next Week click should set navigation=true');
            assert.strictEqual(request.shiftedToday, '2026-05-24', 'render should receive the new shiftedToday');
        } finally {
            renderSpy.restore();
        }
    });

    test('Today click sends navigation=true with today as the new anchor (so the week snaps to today)', async function () {
        this.timeout(15000);

        // Open the panel and then nudge it onto a different anchor so the
        // Today click has somewhere to come back from.
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        const refreshCb = (
            AgendaPanel as unknown as {
                refreshCallback?: (date?: string, userInitiated?: boolean) => Promise<void>;
            }
        ).refreshCallback;
        assert.ok(refreshCb, 'refreshCallback should be set after the panel opens');

        // Step away (imitates Next Week).
        await refreshCb('2026-05-24', true);
        await waitForAgendaRender('week');

        const renderSpy = sinon.spy(AgendaPanel, 'render');
        try {
            // Today click: the webview computes today's local date and
            // posts a `navigate` message with it -- imitate that here.
            const todayDate = new Date();
            const todayIso =
                `${todayDate.getFullYear()}-` +
                `${String(todayDate.getMonth() + 1).padStart(2, '0')}-` +
                String(todayDate.getDate()).padStart(2, '0');

            await refreshCb(todayIso, true);
            await waitUntil(() => renderSpy.callCount >= 1, 'render to be called from the Today refresh');

            assert.ok(renderSpy.callCount >= 1, 'expected AgendaPanel.render to be called from Today refresh');
            const request = renderSpy.lastCall.args[0];
            assert.strictEqual(request.userInitiated, true, 'Today click should be userInitiated=true');
            assert.strictEqual(
                request.navigation,
                true,
                'Today click should set navigation=true (so the webview re-anchors)'
            );
            assert.strictEqual(request.shiftedToday, todayIso, 'render should receive today as the new shiftedToday');
        } finally {
            renderSpy.restore();
        }
    });

    test('Repeated Show Agenda (Week) sends navigation=false (so the webview keeps scroll on the current week)', async function () {
        this.timeout(15000);

        // First open establishes the panel.
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        const renderSpy = sinon.spy(AgendaPanel, 'render');
        try {
            // Second invocation while the panel is already open.
            await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
            await waitForAgendaRender('week');

            assert.ok(renderSpy.callCount >= 1, 'expected AgendaPanel.render to be called on repeat');
            const { navigation } = renderSpy.lastCall.args[0];
            assert.strictEqual(navigation, false, 'repeated Show Agenda (Week) should NOT be marked as navigation');
        } finally {
            renderSpy.restore();
        }
    });

    test('cycleTag command works while the agenda webview is the active tab', async function () {
        this.timeout(10000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update(
            'fileTags',
            [
                { name: 'ALL', pattern: '' },
                { name: 'WORK', pattern: 'work' }
            ],
            vscode.ConfigurationTarget.Workspace
        );
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        await vscode.commands.executeCommand('markdown-org.cycleTag');
        await waitForValue(
            () => vscode.workspace.getConfiguration('markdown-org').get<string>('currentTag'),
            'WORK',
            'currentTag to cycle to WORK'
        );

        const after = vscode.workspace.getConfiguration('markdown-org').get<string>('currentTag');
        assert.strictEqual(after, 'WORK', `expected currentTag to cycle to WORK, got ${after}`);

        const errs = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.deepStrictEqual(errs, [], `showErrorMessage was called: ${errs.join('; ')}`);
    });
});
