import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { suite, before, beforeEach, afterEach, after, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';
import { __setLogSinkForTesting } from '../../utils/logChannel';
import { makeExtractorFake } from '../_execFake';
import { waitUntil } from './_helpers';
/**
 * What the page reports to the host when it fails, and what the host does with
 * it. The toast is deliberately once per panel -- a broken payload fails again
 * on every file-watcher refresh -- so everything else has to reach the
 * diagnostic channel, or a second, different failure would vanish.
 */
suite('Agenda failure reporting', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-diagnostics.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;
    let logged: string[];

    /** The host-side message handler, which production code only reaches from the webview. */
    const post = (message: unknown): Promise<void> =>
        (AgendaPanel as unknown as { handleWebviewMessage(m: unknown): Promise<void> }).handleWebviewMessage(message);

    before(() => {
        fs.mkdirSync(testWorkspaceDir, { recursive: true });
        fs.writeFileSync(testFile, '## TODO Sample\n');
    });

    after(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        execFileStub = sinon
            .stub(exec, 'execFile')
            .callsFake(makeExtractorFake({ day: [], week: [], month: [], tasks: [] }));
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');

        logged = [];
        __setLogSinkForTesting((message) => logged.push(message));
    });

    afterEach(async () => {
        __setLogSinkForTesting(undefined);
        execFileStub.restore();
        resolveExtractorStub.restore();
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('a second render failure still reaches the diagnostic channel, with only one toast', async function () {
        this.timeout(15000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');

        showErrorStub.resetHistory();
        logged.length = 0;

        await post({ command: 'renderError', message: 'first failure' });
        await post({ command: 'renderError', message: 'second, different failure' });

        assert.strictEqual(showErrorStub.callCount, 1, 'exactly one toast per panel');
        assert.strictEqual(logged.length, 2, `both reasons should be logged, got: ${JSON.stringify(logged)}`);
        assert.ok(logged[1].includes('second, different failure'), `the later reason must survive, got: ${logged[1]}`);
    });

    test('an undelivered headerMode is logged and re-sent on the next ready', async function () {
        this.timeout(15000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('agendaHeaderMode', 'full', vscode.ConfigurationTarget.Workspace);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');

        const panel = (AgendaPanel as unknown as { currentPanel: vscode.WebviewPanel }).currentPanel;
        const sent: unknown[] = [];
        // The page is reloading: VS Code answers false and drops the message.
        const postStub = sinon.stub(panel.webview, 'postMessage').callsFake((message: unknown) => {
            sent.push(message);
            return Promise.resolve(false);
        });
        logged.length = 0;

        try {
            await config.update('agendaHeaderMode', 'compact', vscode.ConfigurationTarget.Workspace);
            // The configuration listener runs on the next tick, and the delivery
            // result is a promise on top of that.
            await waitUntil(
                () => logged.some((line) => line.includes('headerMode')),
                'the undelivered headerMode to be logged'
            );

            const failed = sent.filter((m) => (m as { command?: string }).command === 'headerMode');
            assert.strictEqual(failed.length, 1, 'the mode should have been pushed once');

            // A reloaded page reports ready; the queued mode goes out again.
            postStub.resetHistory();
            sent.length = 0;
            postStub.callsFake((message: unknown) => {
                sent.push(message);
                return Promise.resolve(true);
            });
            await post({ command: 'ready' });
            await waitUntil(
                () => sent.some((m) => (m as { command?: string }).command === 'headerMode'),
                'the queued headerMode to be re-sent'
            );
        } finally {
            postStub.restore();
            await config.update('agendaHeaderMode', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    test('a background page warning is logged without consuming the toast', async function () {
        this.timeout(15000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek');

        showErrorStub.resetHistory();
        logged.length = 0;

        // What the page's global error / unhandledrejection listeners send: a
        // rejected font-loading promise is not a render failure.
        await post({ command: 'pageWarning', message: 'agenda promise rejection: font load' });
        await post({ command: 'renderError', message: 'the real render failure' });

        assert.strictEqual(showErrorStub.callCount, 1, 'only the render failure raises a toast');
        assert.ok(
            showErrorStub.firstCall.args[0].includes('the real render failure'),
            `the toast should describe the render failure, got: ${showErrorStub.firstCall.args[0]}`
        );
        assert.strictEqual(logged.length, 2, `both messages should be logged, got: ${JSON.stringify(logged)}`);
    });
});
