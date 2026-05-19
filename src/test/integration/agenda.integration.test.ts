import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as sinon from 'sinon';
import type * as cp from 'child_process';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

/**
 * Build an execFile fake that hands back a different stdout depending on the
 * arguments the agenda code passes to `markdown-org-extract`. The wrapper
 * supports the various Node `execFile` overloads (with/without options) by
 * always taking the callback from the last argument.
 */
function makeExtractorFake(payloads: {
    day: unknown;
    week: unknown;
    month: unknown;
    tasks: unknown;
    holidays?: unknown;
}) {
    return (..._args: unknown[]) => {
        const callback = _args[_args.length - 1] as ExecFileCallback;
        const cliArgs = (_args[1] as string[]) || [];
        let response: unknown = [];
        if (cliArgs.includes('--holidays')) {
            response = payloads.holidays ?? [];
        } else if (cliArgs.includes('--tasks')) {
            response = payloads.tasks;
        } else if (cliArgs.includes('--agenda')) {
            const mode = cliArgs[cliArgs.indexOf('--agenda') + 1];
            if (mode === 'day') response = payloads.day;
            else if (mode === 'week') response = payloads.week;
            else if (mode === 'month') response = payloads.month;
        }
        const stdout = JSON.stringify(response);
        queueMicrotask(() => callback(null, stdout, ''));
        return {} as unknown as cp.ChildProcess;
    };
}

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

    const tasksPayload = [{ file: testFile, line: 1, heading: 'Task', content: '', task_type: 'TODO', priority: 'A' }];

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
        await new Promise((resolve) => setTimeout(resolve, 300));
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

    test('Show Agenda (Week) loads sparse payload without error', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await new Promise((resolve) => setTimeout(resolve, 300));
        assertNoError();
    });

    test('Show Agenda (Month) loads sparse payload without error', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaMonth');
        await new Promise((resolve) => setTimeout(resolve, 300));
        assertNoError();
    });

    test('Show Tasks loads without error', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showTasks');
        await new Promise((resolve) => setTimeout(resolve, 300));
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
            await new Promise((resolve) => setTimeout(resolve, 200));
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
        await new Promise((resolve) => setTimeout(resolve, 300));
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showAgendaDay');
        assert.strictEqual(info.mode, 'day');
        assert.deepStrictEqual(info.dayHeaders, ['2025-12-09']);
    });

    test('Week mode renders day-headers for every date in the payload, even sparse entries', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek', '2025-12-09');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showAgendaWeek');
        assert.strictEqual(info.mode, 'week');
        // sparseWeek above contains '2025-12-08' (with one task) and
        // '2025-12-09' (with all four buckets empty). Both dates still need
        // their own .day-header rendered in the DOM.
        assert.deepStrictEqual(info.dayHeaders, ['2025-12-08', '2025-12-09']);
    });
});

// The agenda lists every task that `markdown-org-extract` returns, regardless
// of where the file actually lives -- the extractor is a broad-search tool
// and is the source of truth for what is reachable. These tests pin the
// behaviour described in CLAUDE.md: any path coming through `openTask` must
// open, even when it points outside `workspaceFolders` or through a symlink.
suite('AgendaPanel.openTaskInEditor', () => {
    const sandboxDir = path.join(os.tmpdir(), 'markdown-org-openTask-tests');
    let showErrorStub: sinon.SinonStub;

    before(() => {
        fs.mkdirSync(sandboxDir, { recursive: true });
    });

    beforeEach(() => {
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
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
        assert.ok(calls[0].includes('failed to open'), `unexpected error message: ${calls[0]}`);
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

    test('package.json: show* keybindings include markdown-org.agendaFocused in when', () => {
        const ext = vscode.extensions.getExtension('vitalyostanin.markdown-org-vscode');
        assert.ok(ext, 'extension not found');
        const keybindings: Array<{ command: string; when?: string }> = ext.packageJSON.contributes.keybindings;
        const week = keybindings.find((k) => k.command === 'markdown-org.showAgendaWeek');
        const month = keybindings.find((k) => k.command === 'markdown-org.showAgendaMonth');
        assert.ok(week, 'showAgendaWeek keybinding missing');
        assert.ok(month, 'showAgendaMonth keybinding missing');
        assert.ok(
            week.when && week.when.includes('markdown-org.agendaFocused'),
            `showAgendaWeek when missing agendaFocused: ${week.when}`
        );
        assert.ok(
            month.when && month.when.includes('markdown-org.agendaFocused'),
            `showAgendaMonth when missing agendaFocused: ${month.when}`
        );
    });

    test('package.json: cycleTag keybinding has no editorLangId gate (works everywhere)', () => {
        const ext = vscode.extensions.getExtension('vitalyostanin.markdown-org-vscode');
        const keybindings: Array<{ command: string; when?: string }> = ext!.packageJSON.contributes.keybindings;
        const cycle = keybindings.find((k) => k.command === 'markdown-org.cycleTag');
        assert.ok(cycle, 'cycleTag keybinding missing');
        // Either no when at all, or one that does not depend on editorLangId.
        if (cycle.when) {
            assert.ok(
                !cycle.when.includes('editorLangId'),
                `cycleTag when should not gate on editorLangId: ${cycle.when}`
            );
        }
    });

    test('shiftedToday is reset when the agenda panel is disposed', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await new Promise((resolve) => setTimeout(resolve, 300));

        const beforeClose = (AgendaPanel as unknown as { shiftedToday?: string }).shiftedToday;
        assert.ok(beforeClose, 'expected AgendaPanel.shiftedToday to be populated while the panel is open');

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise((resolve) => setTimeout(resolve, 300));

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
            await new Promise((resolve) => setTimeout(resolve, 300));

            const focusCalls = spy
                .getCalls()
                .filter((c) => c.args[0] === 'setContext' && c.args[1] === 'markdown-org.agendaFocused');
            assert.ok(
                focusCalls.some((c) => c.args[2] === true),
                'expected setContext(markdown-org.agendaFocused, true) on open'
            );

            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await new Promise((resolve) => setTimeout(resolve, 300));

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
        await new Promise((resolve) => setTimeout(resolve, 300));
        let tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(
            tab && tab.label.toLowerCase().includes('week'),
            `expected active tab to show week mode, got ${tab?.label}`
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaMonth');
        await new Promise((resolve) => setTimeout(resolve, 300));
        tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(
            tab && tab.label.toLowerCase().includes('month'),
            `expected active tab to show month mode, got ${tab?.label}`
        );

        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await new Promise((resolve) => setTimeout(resolve, 300));
        tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(
            tab && tab.label.toLowerCase().includes('day'),
            `expected active tab to show day mode, got ${tab?.label}`
        );

        await vscode.commands.executeCommand('markdown-org.showTasks');
        await new Promise((resolve) => setTimeout(resolve, 300));
        tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(
            tab && tab.label.toLowerCase().includes('tasks'),
            `expected active tab to show tasks mode, got ${tab?.label}`
        );

        const errs = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.deepStrictEqual(errs, [], `showErrorMessage was called: ${errs.join('; ')}`);
    });

    test('Next Week click sends navigation=true so the webview scrolls to the top, not mid-week', async function () {
        this.timeout(15000);

        // Open the panel on the current week first.
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await new Promise((resolve) => setTimeout(resolve, 300));

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
            await new Promise((resolve) => setTimeout(resolve, 300));

            assert.ok(renderSpy.callCount >= 1, 'expected AgendaPanel.render to be called from refreshCallback');
            const last = renderSpy.lastCall;
            // Render signature: (_context, data, mode, date, refreshCallback,
            // userInitiated, currentTag, holidays, navigation). The flag we
            // care about is the 9th positional argument.
            const navigationArg = last.args[8];
            const userInitiatedArg = last.args[5];
            const dateArg = last.args[3];
            assert.strictEqual(userInitiatedArg, true, 'Next Week click should be userInitiated=true');
            assert.strictEqual(navigationArg, true, 'Next Week click should set navigation=true');
            assert.strictEqual(dateArg, '2026-05-24', 'render should receive the new shiftedToday');
        } finally {
            renderSpy.restore();
        }
    });

    test('Today click sends navigation=true with today as the new anchor (so the week snaps to today)', async function () {
        this.timeout(15000);

        // Open the panel and then nudge it onto a different anchor so the
        // Today click has somewhere to come back from.
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await new Promise((resolve) => setTimeout(resolve, 300));

        const refreshCb = (
            AgendaPanel as unknown as {
                refreshCallback?: (date?: string, userInitiated?: boolean) => Promise<void>;
            }
        ).refreshCallback;
        assert.ok(refreshCb, 'refreshCallback should be set after the panel opens');

        // Step away (imitates Next Week).
        await refreshCb('2026-05-24', true);
        await new Promise((resolve) => setTimeout(resolve, 300));

        const renderSpy = sinon.spy(AgendaPanel, 'render');
        try {
            // Today click: the webview computes today's local date and
            // posts a `navigate` message with it -- imitate that here.
            const todayDate = new Date();
            const todayIso =
                todayDate.getFullYear() +
                '-' +
                String(todayDate.getMonth() + 1).padStart(2, '0') +
                '-' +
                String(todayDate.getDate()).padStart(2, '0');

            await refreshCb(todayIso, true);
            await new Promise((resolve) => setTimeout(resolve, 300));

            assert.ok(renderSpy.callCount >= 1, 'expected AgendaPanel.render to be called from Today refresh');
            const last = renderSpy.lastCall;
            const navigationArg = last.args[8];
            const userInitiatedArg = last.args[5];
            const dateArg = last.args[3];
            assert.strictEqual(userInitiatedArg, true, 'Today click should be userInitiated=true');
            assert.strictEqual(
                navigationArg,
                true,
                'Today click should set navigation=true (so the webview re-anchors)'
            );
            assert.strictEqual(dateArg, todayIso, 'render should receive today as the new shiftedToday');
        } finally {
            renderSpy.restore();
        }
    });

    test('Repeated Show Agenda (Week) sends navigation=false (so the webview keeps scroll on the current week)', async function () {
        this.timeout(15000);

        // First open establishes the panel.
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        await new Promise((resolve) => setTimeout(resolve, 300));

        const renderSpy = sinon.spy(AgendaPanel, 'render');
        try {
            // Second invocation while the panel is already open.
            await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
            await new Promise((resolve) => setTimeout(resolve, 300));

            assert.ok(renderSpy.callCount >= 1, 'expected AgendaPanel.render to be called on repeat');
            const navigationArg = renderSpy.lastCall.args[8];
            assert.strictEqual(navigationArg, false, 'repeated Show Agenda (Week) should NOT be marked as navigation');
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
        await new Promise((resolve) => setTimeout(resolve, 300));

        await vscode.commands.executeCommand('markdown-org.cycleTag');
        await new Promise((resolve) => setTimeout(resolve, 300));

        const after = vscode.workspace.getConfiguration('markdown-org').get<string>('currentTag');
        assert.strictEqual(after, 'WORK', `expected currentTag to cycle to WORK, got ${after}`);

        const errs = showErrorStub.getCalls().map((c) => String(c.args[0]));
        assert.deepStrictEqual(errs, [], `showErrorMessage was called: ${errs.join('; ')}`);
    });
});
