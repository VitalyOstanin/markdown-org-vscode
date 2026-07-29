import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as sinon from 'sinon';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { toIsoDate } from '../../utils/isoDate';
import { AgendaPanel } from '../../views/agendaPanel';
import { makeExtractorFake } from '../_execFake';
import { waitForAgendaRender } from './_helpers';

// Two week-view behaviours that only exist once the page is scrolled, which is
// why they need a real webview rather than jsdom: the day header is
// `position: sticky`, and both the anchor fix and the clipping chips are
// computed from live geometry that jsdom does not produce.
//
// The scroll is driven through `AgendaPanel.setScrollForTesting`, and the
// results are read back through the `todayFirstRowHidden` / `clipAbove` /
// `clipBelow` / `scrollY` fields of `queryRenderedInfoForTesting`.
suite('Agenda Week Clipping Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-clip.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    // The page decides what "today" is from its own clock (the sticky anchor and
    // the chips both key off it), so the payload is built around the real
    // current date rather than a fixed one.
    const today = toIsoDate(new Date());
    const yesterday = toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    /** Enough rows that the week is taller than any panel the suite runs in. */
    function rows(count: number, prefix: string) {
        return Array.from({ length: count }, (_, i) => ({
            file: testFile,
            line: i + 1,
            heading: `${prefix} ${i + 1}`,
            content: '',
            task_type: 'TODO'
        }));
    }

    const clipWeek = [
        { date: yesterday, scheduled_no_time: rows(40, 'Yesterday') },
        { date: today, scheduled_no_time: rows(40, 'Today') }
    ];

    // Tasks mode is the view the week is entered from: it scrolls, and it
    // renders no day-header, so the switch takes the branch that re-focuses the
    // week instead of the one that preserves the scroll position.
    const clipTasks = rows(80, 'Task');

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
                day: [{ date: today, scheduled_no_time: rows(40, 'Today') }],
                week: clipWeek,
                month: [],
                tasks: clipTasks,
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

    /** Poll the snapshot until `read` holds, returning the snapshot that satisfied it. */
    async function waitForSnapshot(
        read: (info: NonNullable<Awaited<ReturnType<typeof AgendaPanel.queryRenderedInfoForTesting>>>) => boolean,
        what: string,
        timeoutMs = 6000
    ) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const last = await AgendaPanel.queryRenderedInfoForTesting(1000).catch(() => null);
            if (last && read(last)) {
                return last;
            }
            if (Date.now() >= deadline) {
                throw new Error(`${what} did not hold within ${timeoutMs}ms (last: ${JSON.stringify(last)})`);
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }

    test('switching into Week from a scrolled view leaves no row behind the sticky day header', async function () {
        this.timeout(20000);

        // Tasks mode, scrolled well past the top: this is the state the user
        // switches to Week from.
        await vscode.commands.executeCommand('markdown-org.showTasks');
        await waitForAgendaRender('tasks');
        await AgendaPanel.setScrollForTesting(600);
        const scrolled = await waitForSnapshot((info) => info.scrollY > 0, 'the tasks view to scroll off the top');
        assert.ok(
            scrolled.scrollY > 0,
            'the fixture must be tall enough to scroll; otherwise this test proves nothing'
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        // Before the fix the page stayed where Tasks had left it: today's
        // header was already pinned, `scrollIntoView` measured the pinned box,
        // decided it was in place, and the day's first rows stayed under it.
        const info = await waitForSnapshot(
            (snapshot) => !snapshot.todayFirstRowHidden,
            "today's first row to clear the sticky header"
        );
        assert.ok(info.dayHeaders.includes(today), `the week payload must contain today (${today})`);
        assert.strictEqual(info.todayFirstRowHidden, false);
        assert.strictEqual(
            info.clipAbove[info.dayHeaders.indexOf(today)],
            0,
            'no row of today may be hidden above once the week has been focused'
        );
    });

    test('the day header reports the rows hidden below it and clears them on scroll', async function () {
        this.timeout(20000);

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');

        // Today is focused at the top of the panel and carries 40 rows, so most
        // of them are past the bottom edge.
        const focused = await waitForSnapshot(
            (info) => info.dayHeaders.includes(today),
            'the week to render a header for today'
        );
        const todayIndex = focused.dayHeaders.indexOf(today);
        const belowAtTop = await waitForSnapshot(
            (info) => info.clipBelow[todayIndex]! > 0,
            "today's rows to be reported as hidden below the panel"
        );
        assert.strictEqual(belowAtTop.clipAbove[todayIndex], 0, 'nothing is hidden above right after focusing');

        // Scrolling down moves rows from the "below" side to the "above" one:
        // the two chips are measured, not derived from the payload.
        await AgendaPanel.setScrollForTesting(belowAtTop.scrollY + 400);
        const scrolled = await waitForSnapshot(
            (info) => info.clipAbove[todayIndex]! > 0,
            "today's rows to be reported as hidden above the sticky header"
        );
        assert.ok(
            scrolled.clipBelow[todayIndex]! < belowAtTop.clipBelow[todayIndex]!,
            `scrolling down must reduce the rows hidden below (was ${belowAtTop.clipBelow[todayIndex]}, now ${scrolled.clipBelow[todayIndex]})`
        );

        // And back: the chips retract rather than keeping a stale count.
        await AgendaPanel.setScrollForTesting(0);
        const back = await waitForSnapshot(
            (info) => info.clipAbove[todayIndex] === 0,
            'the "hidden above" chip to retract at the top of the page'
        );
        assert.strictEqual(back.clipAbove[todayIndex], 0);
    });

    test('a fully visible day reports nothing hidden on either side', async function () {
        this.timeout(20000);

        // A one-row week fits in any panel the suite runs in, so both chips must
        // stay empty -- a marker that appears when everything is visible is
        // worse than no marker.
        execFileStub.restore();
        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(
            makeExtractorFake({
                day: [],
                week: [{ date: today, scheduled_no_time: rows(1, 'Only') }],
                month: [],
                tasks: [],
                holidays: []
            })
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await waitForAgendaRender('week');
        const info = await waitForSnapshot(
            (snapshot) => snapshot.dayHeaders.includes(today),
            'the week to render a header for today'
        );
        const todayIndex = info.dayHeaders.indexOf(today);
        assert.strictEqual(info.clipAbove[todayIndex], 0);
        assert.strictEqual(info.clipBelow[todayIndex], 0);
        assert.strictEqual(info.todayFirstRowHidden, false);
    });
});
