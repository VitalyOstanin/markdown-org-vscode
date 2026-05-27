import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import type * as cp from 'child_process';
import { suite, beforeEach, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { syncNow } from '../../commands/gcalSync';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

// A Response-like stub good enough for the two consumers in play:
//   * oauth.postToken reads `res.ok` / `res.status` and `res.json()`;
//   * calendarClient.call reads `res.status` and `res.json()`.
function jsonResponse(status: number, body: unknown): unknown {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// The DONE task carries an active SCHEDULED timestamp, so `isSyncable` is true
// and the deletion is attributable specifically to the `DONE && onDone=delete`
// branch in the sync engine -- the branch that was unreachable while the
// extractor's flat `--tasks` mode filtered out DONE entries. The org-id ID is a
// plain UUID; the engine derives the Google event id from it (dashes removed,
// lowercased) -> EVENT_ID below.
const ORG_ID = '11111111-2222-3333-4444-555555555555';
const EVENT_ID = '11111111222233334444555555555555';

suite('Google Calendar sync: DONE -> delete', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const doneFile = path.join(testWorkspaceDir, 'gcal-done.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let fetchStub: sinon.SinonStub;
    let warnStub: sinon.SinonStub;
    let infoStub: sinon.SinonStub;
    let storageRoot: string;
    let fetchCalls: Array<{ url: string; method: string }>;

    const donePayload = [
        {
            file: doneFile,
            line: 1,
            heading: 'Done task',
            content: '',
            task_type: 'DONE',
            timestamp_active: true,
            timestamp_type: 'SCHEDULED',
            timestamp_date: '2026-05-27',
            timestamp_time: '10:00',
            properties: { ID: ORG_ID }
        }
    ];

    beforeEach(async () => {
        // Stubs first, config second: if a config write ever throws, afterEach
        // still has defined stubs to restore.
        storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-sync-it-'));

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');

        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake((..._args: unknown[]) => {
            const callback = _args[_args.length - 1] as ExecFileCallback;
            const stdout = JSON.stringify(donePayload);
            queueMicrotask(() => callback(null, stdout, ''));
            return {} as unknown as cp.ChildProcess;
        });

        fetchCalls = [];
        fetchStub = sinon.stub(globalThis, 'fetch');
        fetchStub.callsFake((async (input: unknown, init?: { method?: string }) => {
            const url = String(input);
            const method = (init?.method ?? 'GET').toUpperCase();
            fetchCalls.push({ url, method });
            if (url === 'https://oauth2.googleapis.com/token') {
                return jsonResponse(200, { access_token: 'at', expires_in: 3600 });
            }
            if (method === 'GET' && url === 'https://www.googleapis.com/calendar/v3/calendars/cal') {
                return jsonResponse(200, { id: 'cal' });
            }
            if (method === 'DELETE' && url.startsWith('https://www.googleapis.com/calendar/v3/calendars/cal/events/')) {
                return jsonResponse(200, {});
            }
            return jsonResponse(404, { error: { message: `unexpected ${method} ${url}` } });
        }) as unknown as typeof fetch);

        warnStub = sinon.stub(vscode.window, 'showWarningMessage');
        infoStub = sinon.stub(vscode.window, 'showInformationMessage');

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        // gcalSync.clientId is scope=machine -- it can only be written to User
        // (Global) settings; a Workspace write throws.
        await config.update('gcalSync.clientId', 'cid', vscode.ConfigurationTarget.Global);
        await config.update('gcalSync.calendarId', 'cal', vscode.ConfigurationTarget.Workspace);
        await config.update('gcalSync.onDone', 'delete', vscode.ConfigurationTarget.Workspace);
    });

    afterEach(async () => {
        execFileStub.restore();
        resolveExtractorStub.restore();
        fetchStub.restore();
        warnStub.restore();
        infoStub.restore();
        fs.rmSync(storageRoot, { recursive: true, force: true });

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('gcalSync.calendarId', undefined, vscode.ConfigurationTarget.Workspace);
        await config.update('gcalSync.onDone', undefined, vscode.ConfigurationTarget.Workspace);
        await config.update('gcalSync.clientId', undefined, vscode.ConfigurationTarget.Global);
    });

    function makeContext(): vscode.ExtensionContext {
        const secretMap = new Map<string, string>([
            ['markdown-org.gcal.refreshToken', 'rt'],
            ['markdown-org.gcal.clientSecret', 'cs']
        ]);
        const secrets = {
            get: (k: string) => Promise.resolve(secretMap.get(k)),
            store: (k: string, v: string) => {
                secretMap.set(k, v);
                return Promise.resolve();
            },
            delete: (k: string) => {
                secretMap.delete(k);
                return Promise.resolve();
            }
        };
        return {
            secrets,
            // A fresh subdir the lock helper will create via fs.createDirectory.
            globalStorageUri: vscode.Uri.file(path.join(storageRoot, 'globalStorage'))
        } as unknown as vscode.ExtensionContext;
    }

    test('a DONE task with onDone=delete deletes its event and the extractor is asked for DONE tasks', async function () {
        this.timeout(15000);

        await syncNow(makeContext());

        // No warning means the run was trusted, acquired the lock, and reached
        // the engine (untrusted / lock-contention paths both warn and bail).
        const warns = warnStub.getCalls().map((c) => String(c.args[0]));
        assert.deepStrictEqual(warns, [], `unexpected warning(s): ${warns.join('; ')}`);

        // The extractor must be invoked in flat `--tasks` mode WITH the
        // DONE-including flag; without it the DONE task never reaches the engine
        // and the delete below cannot happen.
        const tasksCall = execFileStub.getCalls().find((c) => (c.args[1] as string[]).includes('--tasks'));
        assert.ok(tasksCall, 'expected a --tasks invocation of the extractor');
        const args = tasksCall.args[1] as string[];
        assert.ok(
            args.includes('--tasks-include-done'),
            `extractor args missing --tasks-include-done: ${args.join(' ')}`
        );

        // The DONE task's event must be deleted, keyed by the id derived from
        // its org-id ID (dashes stripped, lowercased).
        const deleteCall = fetchCalls.find((c) => c.method === 'DELETE');
        assert.ok(deleteCall, `expected a DELETE event call; calls: ${JSON.stringify(fetchCalls)}`);
        assert.ok(
            deleteCall.url.endsWith(`/calendars/cal/events/${EVENT_ID}`),
            `DELETE hit an unexpected url: ${deleteCall.url}`
        );
    });
});
