import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as sinon from 'sinon';
import type * as cp from 'child_process';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../utils/exec';
import { extractor } from '../utils/extractor';
import { AgendaPanel } from '../views/agendaPanel';

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
        if (process.platform === 'win32') {
            // Creating file symlinks on Windows requires admin / developer mode;
            // skip rather than fail on stock CI runners.
            this.skip();
        }
        const realFile = path.join(sandboxDir, 'real.md');
        const symlinkFile = path.join(sandboxDir, 'symlink.md');
        fs.writeFileSync(realFile, '## TODO Symlinked file\n');
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
