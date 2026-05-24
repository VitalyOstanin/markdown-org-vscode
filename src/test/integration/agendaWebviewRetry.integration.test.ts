import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import type * as cp from 'child_process';
import { suite, before, beforeEach, afterEach, after, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

/**
 * Cover the ServiceWorker-race retry path documented in agendaPanel.ts:
 * the production webview sends `{command: 'ready'}` from acquireVsCodeApi()
 * to confirm its host iframe survived ServiceWorker registration; if no
 * `ready` arrives within WEBVIEW_READY_TIMEOUT_MS, AgendaPanel disposes the
 * panel and recreates it.
 *
 * We trigger that path deterministically by:
 *   1. setting a millisecond-scale timeout via `__testSetReadyTimeoutMs`,
 *   2. suppressing the first N `ready` handshakes via
 *      `__testSuppressNextReadies(N)` so handleReady silently drops them and
 *      the timeout still fires,
 *   3. asserting that `__testGetCreateCount()` rose by exactly N+1 (the
 *      original panel plus N retries).
 *
 * Without retry the user sees an empty panel with "Failed to register a
 * ServiceWorker: The document is in an invalid state" notification.
 */
suite('Agenda webview ServiceWorker-race retry', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-retry.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;

    before(() => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        fs.writeFileSync(testFile, '## TODO Sample\n');
    });

    after(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    // Test-only timeout for the webview ready handshake. The shortest the
    // production code allows is "set anything > 0"; the value here trades
    // test wall-time against runner-latency tolerance. 500 ms is generous
    // enough for macos-15 GitHub runners, where the prior 150 ms was
    // racing the webview iframe startup and producing a false retry on
    // the happy-path test (observed in CI on v0.6.1).
    const TEST_READY_TIMEOUT_MS = 500;

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        execFileStub = sinon.stub(exec, 'execFile').callsFake((..._args: unknown[]) => {
            const callback = _args[_args.length - 1] as ExecFileCallback;
            // Empty payload is fine -- this suite cares about webview retry,
            // not rendered tasks.
            queueMicrotask(() => callback(null, JSON.stringify([]), ''));
            return {} as unknown as cp.ChildProcess;
        });

        AgendaPanel.__testSetReadyTimeoutMs(TEST_READY_TIMEOUT_MS);
        AgendaPanel.__testSuppressNextReadies(0);
    });

    afterEach(async () => {
        AgendaPanel.__testSetReadyTimeoutMs(undefined);
        AgendaPanel.__testSuppressNextReadies(0);
        execFileStub.restore();
        resolveExtractorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('happy path: ready handshake arrives, no retry fires', async function () {
        this.timeout(10000);
        const before = AgendaPanel.__testGetCreateCount();

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        // Wait noticeably longer than the timeout so a buggy implementation
        // that fails to clear the timer would have retried by now.
        await new Promise((r) => setTimeout(r, TEST_READY_TIMEOUT_MS * 4));

        const delta = AgendaPanel.__testGetCreateCount() - before;
        assert.strictEqual(delta, 1, `expected exactly one createWebviewPanel call, got ${delta}`);
    });

    test('retry path: one suppressed ready leads to exactly one recreation', async function () {
        this.timeout(10000);
        const before = AgendaPanel.__testGetCreateCount();
        // Drop the first ready handshake -- emulates a webview whose
        // ServiceWorker registration never completed on first attempt.
        AgendaPanel.__testSuppressNextReadies(1);

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        // One timeout window for the suppressed first ready, then enough
        // for the second create's handshake to land.
        await new Promise((r) => setTimeout(r, TEST_READY_TIMEOUT_MS * 4));

        const delta = AgendaPanel.__testGetCreateCount() - before;
        assert.strictEqual(delta, 2, `expected one retry (2 creates total), got ${delta}`);
    });

    test('retry path: two suppressed readies still recover within max retries', async function () {
        this.timeout(15000);
        const before = AgendaPanel.__testGetCreateCount();
        AgendaPanel.__testSuppressNextReadies(2);

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');
        // Two suppressed handshakes -> two retry windows + slack for the
        // third create's handshake.
        await new Promise((r) => setTimeout(r, TEST_READY_TIMEOUT_MS * 6));

        const delta = AgendaPanel.__testGetCreateCount() - before;
        assert.strictEqual(delta, 3, `expected two retries (3 creates total), got ${delta}`);
    });
});
