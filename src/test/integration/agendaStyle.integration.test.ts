import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { setTimeout as sleep } from 'node:timers/promises';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import type * as cp from 'child_process';
import { suite, before, beforeEach, afterEach, after, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

/**
 * Same day-payload fake used by agenda.integration.test.ts, kept minimal
 * here since these tests only need `showAgendaWeek` to succeed -- the
 * assertions are about the `markdown-org.agendaStyle` setting, not about
 * task rendering content.
 */
function makeExtractorFake(payloads: { day: unknown; week: unknown; month: unknown; tasks: unknown }) {
    return (..._args: unknown[]) => {
        const callback = _args[_args.length - 1] as ExecFileCallback;
        const cliArgs = (_args[1] as string[]) || [];
        let response: unknown = [];
        if (cliArgs.includes('--holidays')) {
            response = [];
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

suite('Agenda Style Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-style.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    const sparseWeek = [
        { date: '2025-12-08', scheduled_timed: [] },
        { date: '2025-12-09', scheduled_no_time: [] }
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

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');

        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(makeExtractorFake({ day: [], week: sparseWeek, month: [], tasks: [] }));

        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
        execFileStub.restore();
        resolveExtractorStub.restore();
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        // Never leak a non-default agendaStyle into subsequent suites.
        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('agendaStyle', 'hybrid', vscode.ConfigurationTarget.Global);
    });

    after(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    test('markdown-org.agendaStyle setting drives the body data-agenda-style preset', async function () {
        this.timeout(10000);
        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('agendaStyle', 'monospace', vscode.ConfigurationTarget.Global);

        await vscode.commands.executeCommand('markdown-org.showAgendaWeek', '2025-12-09');
        await sleep(300);

        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaWeek');
        const html = panel.webview.html;
        assert.ok(
            html.includes('data-agenda-style="monospace"'),
            'expected the webview body to carry data-agenda-style="monospace"'
        );
    });

    test('markdown-org.cycleAgendaStyle advances the setting monospace -> native', async function () {
        this.timeout(10000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('agendaStyle', 'monospace', vscode.ConfigurationTarget.Global);

        await vscode.commands.executeCommand('markdown-org.cycleAgendaStyle');

        const updated = vscode.workspace.getConfiguration('markdown-org');
        assert.strictEqual(updated.get('agendaStyle'), 'native');
    });
});
