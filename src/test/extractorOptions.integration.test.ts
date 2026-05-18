import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as sinon from 'sinon';
import type * as cp from 'child_process';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../utils/exec';
import { EXTRACTOR_MAX_BUFFER_BYTES } from '../utils/extractor';
import { extractor } from '../utils/extractor';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

/**
 * Verify that the agenda / clocktable code paths pass an explicit
 * `maxBuffer` to `execFile`. The Node default is 1 MiB, which can be
 * exhausted by a large workspace and surfaces as a confusing
 * `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`. The constant is centralized in
 * `utils/extractor.ts` and we want the agenda call site to actually use it.
 */
suite('Extractor execFile options', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-options.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    const dayPayload = [
        {
            date: '2026-01-01',
            overdue: [],
            scheduled_timed: [],
            scheduled_no_time: [],
            upcoming: []
        }
    ];

    before(() => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        fs.writeFileSync(testFile, '## Task\n');
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');

        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake((..._args: unknown[]) => {
            const callback = _args[_args.length - 1] as ExecFileCallback;
            const cliArgs = (_args[1] as string[]) || [];
            const response = cliArgs.includes('--holidays') ? [] : dayPayload;
            queueMicrotask(() => callback(null, JSON.stringify(response), ''));
            return {} as unknown as cp.ChildProcess;
        });
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

    test('showAgenda passes maxBuffer in execFile options so large workspaces do not overflow stdout', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await new Promise((resolve) => setTimeout(resolve, 300));

        const agendaCall = execFileStub.getCalls().find((c) => {
            const args = c.args[1] as string[] | undefined;
            return Array.isArray(args) && args.includes('--agenda');
        });
        assert.ok(agendaCall, 'expected at least one execFile call for the agenda mode');

        // The agenda code path uses the 4-arg execFile overload:
        // execFile(command, args, options, callback)
        const optionsArg = agendaCall!.args[2] as { maxBuffer?: number; encoding?: string } | undefined;
        assert.ok(optionsArg, 'agenda execFile call must include options (3rd arg)');
        assert.strictEqual(
            optionsArg!.maxBuffer,
            EXTRACTOR_MAX_BUFFER_BYTES,
            `maxBuffer must be the shared EXTRACTOR_MAX_BUFFER_BYTES (${EXTRACTOR_MAX_BUFFER_BYTES})`
        );
        assert.strictEqual(optionsArg!.encoding, 'utf-8');
    });
});
