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
import { syncNow, makePropertiesWriter } from '../../commands/gcalSync';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

// A Response-like stub good enough for the two consumers in play:
//   * oauth.postToken reads `res.ok` / `res.status` and `res.json()`;
//   * calendarClient.call reads `res.status` and `res.json()`.
function jsonResponse(status: number, body: unknown): unknown {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function waitUntil(pred: () => boolean, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (pred()) {
            return true;
        }
        await new Promise((r) => setTimeout(r, 20));
    }
    return pred();
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
    let withProgressStub: sinon.SinonStub;
    let progressSettled: boolean;
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

        // Run the wrapped work synchronously so the sync still executes; we only
        // assert how the progress is requested (status bar, not notification)
        // and when it settles. progressSettled flips once the wrapped task's
        // promise resolves -- i.e. when the spinner would be hidden.
        progressSettled = false;
        withProgressStub = sinon.stub(vscode.window, 'withProgress');
        withProgressStub.callsFake(
            (
                _options: vscode.ProgressOptions,
                task: (
                    progress: vscode.Progress<{ message?: string; increment?: number }>,
                    token: vscode.CancellationToken
                ) => Thenable<unknown>
            ) =>
                Promise.resolve(
                    task({ report: () => {} }, {
                        isCancellationRequested: false,
                        onCancellationRequested: () => ({ dispose: () => {} })
                    } as vscode.CancellationToken)
                ).then((r) => {
                    progressSettled = true;
                    return r;
                })
        );

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
        withProgressStub.restore();
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
        // CANCELLED tasks must be surfaced too so their events get deleted; the
        // flag mirrors --tasks-include-done in the flat scope.
        assert.ok(
            args.includes('--tasks-include-cancelled'),
            `extractor args missing --tasks-include-cancelled: ${args.join(' ')}`
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

    test('wraps the sync in a status-bar (Window) progress indicator', async function () {
        this.timeout(15000);

        await syncNow(makeContext());

        assert.ok(withProgressStub.called, 'expected the sync to be wrapped in withProgress');
        const opts = withProgressStub.firstCall.args[0] as vscode.ProgressOptions;
        assert.strictEqual(
            opts.location,
            vscode.ProgressLocation.Window,
            'progress must render in the status bar (Window), not as a notification'
        );
    });

    test('hides the status-bar spinner without waiting for the summary toast to be dismissed', async function () {
        this.timeout(15000);

        // A summary toast the user never dismisses: showInformationMessage stays
        // pending. If the toast were awaited inside withProgress, the wrapped
        // task would never resolve and the spinner would turn forever.
        infoStub.returns(new Promise<undefined>(() => {}));

        // Do not await syncNow: the final notifyInfo is awaited after the
        // progress wrapper and intentionally never resolves here. We only assert
        // that the progress (spinner) settled, and that the sync work ran.
        void syncNow(makeContext());

        const settled = await waitUntil(() => progressSettled, 5000);
        assert.ok(settled, 'withProgress must settle (spinner hidden) before the sync awaits the summary toast');
        assert.ok(
            fetchCalls.some((c) => c.method === 'DELETE'),
            'the sync work itself completed (event deleted) before the toast wait'
        );
    });

    test('summary toast lists the affected event and offers a Show details button', async function () {
        this.timeout(15000);

        await syncNow(makeContext());

        assert.ok(infoStub.called, 'expected a summary toast');
        const [message, action] = infoStub.firstCall.args as [string, string];
        assert.match(message, /1 deleted/, 'toast should include the counts');
        assert.match(message, /Done task/, 'toast should list the affected event heading');
        assert.match(message, /2026-05-27/, 'toast should show the event date');
        assert.strictEqual(action, 'Show details', 'toast should offer a details button');
        // Toasts collapse newlines, so the summary must be one line with the
        // events `·`-separated, and the zero-count categories must be dropped.
        assert.ok(!message.includes('\n'), `toast must be single-line: ${JSON.stringify(message)}`);
        assert.ok(message.includes(' · '), `events should be ·-separated: ${JSON.stringify(message)}`);
        assert.ok(!/\b0 (created|updated|skipped|deferred|failed)\b/.test(message), `zero counts dropped: ${message}`);
    });

    test('on-save trigger: silent on success (no toast for background sync)', async function () {
        this.timeout(15000);

        await syncNow(makeContext(), { trigger: 'onSave' });

        // The DELETE succeeded (DONE -> delete branch with status 200), so
        // summary.failed === 0. On-save is background automation -- no toast.
        assert.ok(
            fetchCalls.some((c) => c.method === 'DELETE'),
            'sanity: the sync did run and deleted the event'
        );
        assert.strictEqual(infoStub.called, false, 'on-save success must not show a summary toast');
    });

    test('on-save trigger: toast on failure so breakage is visible', async function () {
        this.timeout(15000);

        // Force the DELETE branch to return 500 so the engine catches and
        // increments summary.failed. The on-save trigger must surface that.
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
                return jsonResponse(500, { error: { message: 'boom' } });
            }
            return jsonResponse(404, { error: { message: `unexpected ${method} ${url}` } });
        }) as unknown as typeof fetch);

        await syncNow(makeContext(), { trigger: 'onSave' });

        assert.ok(infoStub.called, 'on-save with failures must still show a toast');
        const [message] = infoStub.firstCall.args as [string, string];
        assert.match(message, /1 failed/, `toast should report the failure count: ${message}`);
    });
});

// makePropertiesWriter is the editor binding for the sync engine's local
// write-back: it opens the file, refuses to touch it when it is dirty or the
// line no longer anchors the expected heading, and otherwise applies a
// targeted org-properties edit and saves. The pure edit math lives in
// orgProperties (unit-tested); these tests cover the VS Code binding against a
// real workspace -- open/dirty/anchor/applyEdit/save -- which a unit test
// cannot reach.
suite('Google Calendar sync: makePropertiesWriter', () => {
    const PLANNING = '`SCHEDULED: <2026-05-27 Wed>`';
    let sandboxDir: string;

    beforeEach(async () => {
        sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-writer-it-'));
        // VS Code's Local History copies every saved file into its store
        // asynchronously; with our short-lived tmpdir that copy can race the
        // afterEach cleanup and log a (non-fatal) ENOENT. Disable it for these
        // tests so the save path stays quiet.
        await vscode.workspace
            .getConfiguration('workbench')
            .update('localHistory.enabled', false, vscode.ConfigurationTarget.Global);
    });

    afterEach(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.rmSync(sandboxDir, { recursive: true, force: true });
        await vscode.workspace
            .getConfiguration('workbench')
            .update('localHistory.enabled', undefined, vscode.ConfigurationTarget.Global);
    });

    function writeFile(name: string, content: string): string {
        const p = path.join(sandboxDir, name);
        fs.writeFileSync(p, content);
        return p;
    }

    test('inserts a new org-properties block under the planning line and saves (written)', async function () {
        this.timeout(10000);
        const file = writeFile('insert.md', `## TODO My heading\n${PLANNING}\n`);

        const outcome = await makePropertiesWriter().write(file, 1, 'My heading', {
            ID: 'abc',
            GCAL_EVENT_ID: 'def'
        });

        assert.strictEqual(outcome, 'written');
        const onDisk = fs.readFileSync(file, 'utf-8');
        // Keys are sorted ascending, so GCAL_EVENT_ID precedes ID.
        assert.ok(onDisk.includes('```org-properties'), `block fence missing:\n${onDisk}`);
        assert.ok(/GCAL_EVENT_ID: def\nID: abc/.test(onDisk), `keys not written in sorted order:\n${onDisk}`);
        // The block sits after the planning line, not before it.
        assert.ok(
            onDisk.indexOf(PLANNING) < onDisk.indexOf('```org-properties'),
            `block was placed before the planning line:\n${onDisk}`
        );
    });

    test('replaces an existing org-properties block in place (written)', async function () {
        this.timeout(10000);
        const file = writeFile(
            'replace.md',
            `## TODO My heading\n${PLANNING}\n\`\`\`org-properties\nID: old\n\`\`\`\n`
        );

        const outcome = await makePropertiesWriter().write(file, 1, 'My heading', {
            ID: 'new',
            GCAL_EVENT_ID: 'gid'
        });

        assert.strictEqual(outcome, 'written');
        const onDisk = fs.readFileSync(file, 'utf-8');
        assert.ok(onDisk.includes('ID: new'), `new ID missing:\n${onDisk}`);
        assert.ok(onDisk.includes('GCAL_EVENT_ID: gid'), `GCAL_EVENT_ID missing:\n${onDisk}`);
        assert.ok(!onDisk.includes('ID: old'), `stale block was not replaced:\n${onDisk}`);
        // Still exactly one block (no duplication).
        assert.strictEqual(
            onDisk.match(/```org-properties/g)?.length,
            1,
            `expected exactly one org-properties block:\n${onDisk}`
        );
    });

    test('defers when the line no longer anchors the expected heading', async function () {
        this.timeout(10000);
        const file = writeFile('mismatch.md', `## TODO My heading\n${PLANNING}\n`);
        const before = fs.readFileSync(file, 'utf-8');

        const outcome = await makePropertiesWriter().write(file, 1, 'A different heading', { ID: 'abc' });

        assert.strictEqual(outcome, 'deferred');
        assert.strictEqual(fs.readFileSync(file, 'utf-8'), before, 'file must be untouched on a heading mismatch');
    });

    test('defers when the document has unsaved edits (dirty)', async function () {
        this.timeout(10000);
        const file = writeFile('dirty.md', `## TODO My heading\n${PLANNING}\n`);
        const before = fs.readFileSync(file, 'utf-8');

        // Open the file and make an unsaved edit so the in-memory document is
        // dirty. The writer opens the same document instance and must bail.
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
        const editor = await vscode.window.showTextDocument(doc);
        await editor.edit((eb) => eb.insert(new vscode.Position(doc.lineCount - 1, 0), 'scratch\n'));
        assert.ok(doc.isDirty, 'precondition: document should be dirty after the edit');

        const outcome = await makePropertiesWriter().write(file, 1, 'My heading', { ID: 'abc' });

        assert.strictEqual(outcome, 'deferred');
        assert.strictEqual(
            fs.readFileSync(file, 'utf-8'),
            before,
            'file on disk must be untouched while the document is dirty'
        );

        // Drop the unsaved edit so closeAllEditors in afterEach does not raise a
        // save prompt that would stall the run.
        await vscode.commands.executeCommand('workbench.action.files.revert');
    });
});
