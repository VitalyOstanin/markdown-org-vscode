// Test-only fakes for the Google Calendar sync demo recordings. None of this
// ships in the vsix: src/test/** is excluded from the package (.vscodeignore).
//
// The demo drives the real commands (syncNow / selectCalendar) in a live VS
// Code window so the status-bar spinner, the summary toast, the "Show details"
// channel and the calendar QuickPick all render and get captured. Only the two
// external edges are faked: the network (`globalThis.fetch`) and the extractor
// (`exec.execFile` + `resolveExtractorPath`). The connected state is supplied
// by handing the command a context whose `secrets` already hold a refresh
// token + client secret, exactly as the integration tests do.
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { setTimeout as sleep } from 'node:timers/promises';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import type * as cp from 'child_process';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

/** A Response-like object matching what oauth.postToken and calendarClient read. */
function jsonResponse(status: number, body: unknown): unknown {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Derive the deterministic Google event id the engine computes from an org-id ID. */
export function eventIdFromOrgId(orgId: string): string {
    return orgId.replace(/-/g, '').toLowerCase();
}

export interface DemoTask {
    file: string;
    line: number;
    heading: string;
    content?: string;
    task_type?: string;
    timestamp_type: string;
    timestamp_active: boolean;
    timestamp_date: string;
    timestamp_time?: string;
    properties: Record<string, string>;
}

export interface FakeGcalHandles {
    context: vscode.ExtensionContext;
    restore: () => Promise<void>;
}

/**
 * Install the network + extractor fakes and return a fake ExtensionContext that
 * reports "connected". `tasks` is what the stubbed extractor returns; `latencyMs`
 * is the artificial per-request delay so the status-bar spinner stays visible
 * long enough to record. `calendars` seeds the QuickPick for selectCalendar.
 */
export function installFakeGcal(opts: {
    tasks?: DemoTask[];
    calendars?: { id: string; summary: string; accessRole: string }[];
    latencyMs?: number;
    /** When false the fake context starts with no stored credentials, so the
     *  connect flow prompts for the client secret and persists fresh tokens. */
    connected?: boolean;
}): FakeGcalHandles {
    const tasks = opts.tasks ?? [];
    const calendars = opts.calendars ?? [];
    const latencyMs = opts.latencyMs ?? 500;
    const connected = opts.connected ?? true;
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-demo-'));

    const resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');

    const execFileStub = sinon.stub(exec, 'execFile');
    execFileStub.callsFake((..._args: unknown[]) => {
        const callback = _args[_args.length - 1] as ExecFileCallback;
        const stdout = JSON.stringify(tasks);
        queueMicrotask(() => callback(null, stdout, ''));
        return {} as unknown as cp.ChildProcess;
    });

    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.callsFake((async (input: unknown, init?: { method?: string }) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        // Pace the run so the spinner reads as "working" rather than a flicker.
        await sleep(latencyMs);
        if (url === 'https://oauth2.googleapis.com/token') {
            // refresh_token is only consumed by the connect flow's code exchange;
            // the access-token refresh path ignores it.
            return jsonResponse(200, { access_token: 'demo-at', refresh_token: 'demo-rt', expires_in: 3600 });
        }
        if (method === 'GET' && url === 'https://www.googleapis.com/calendar/v3/calendars/cal') {
            return jsonResponse(200, { id: 'cal' });
        }
        if (method === 'GET' && url === 'https://www.googleapis.com/calendar/v3/users/me/calendarList') {
            return jsonResponse(200, { items: calendars });
        }
        if (method === 'POST' && url === 'https://www.googleapis.com/calendar/v3/calendars/cal/events') {
            return jsonResponse(200, { id: 'created' });
        }
        if (method === 'PATCH' && url.startsWith('https://www.googleapis.com/calendar/v3/calendars/cal/events/')) {
            return jsonResponse(200, {});
        }
        if (method === 'DELETE' && url.startsWith('https://www.googleapis.com/calendar/v3/calendars/cal/events/')) {
            return jsonResponse(200, {});
        }
        return jsonResponse(404, { error: { message: `unexpected ${method} ${url}` } });
    }) as unknown as typeof fetch);

    const secretMap = new Map<string, string>(
        connected
            ? [
                  ['markdown-org.gcal.refreshToken', 'demo-rt'],
                  ['markdown-org.gcal.clientSecret', 'demo-cs']
              ]
            : []
    );
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
    const context = {
        secrets,
        globalStorageUri: vscode.Uri.file(path.join(storageRoot, 'globalStorage'))
    } as unknown as vscode.ExtensionContext;

    return {
        context,
        restore: async () => {
            resolveExtractorStub.restore();
            execFileStub.restore();
            fetchStub.restore();
            fs.rmSync(storageRoot, { recursive: true, force: true });
        }
    };
}

/**
 * Seed the gcal settings the commands read. `clientId` is scope=machine, so it
 * can only be written Global; calendarId/onDone are window-scoped and go to the
 * workspace. The demo runner uses a disposable user-data-dir, so these do not
 * leak into the developer's profile.
 */
export async function seedGcalSettings(workspaceDir: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    await cfg.update('workspaceDir', workspaceDir, vscode.ConfigurationTarget.Workspace);
    await cfg.update('gcalSync.clientId', 'demo-client-id', vscode.ConfigurationTarget.Global);
    await cfg.update('gcalSync.calendarId', 'cal', vscode.ConfigurationTarget.Workspace);
    await cfg.update('gcalSync.onDone', 'delete', vscode.ConfigurationTarget.Workspace);
}

export async function clearGcalSettings(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    await cfg.update('gcalSync.calendarId', undefined, vscode.ConfigurationTarget.Workspace);
    await cfg.update('gcalSync.onDone', undefined, vscode.ConfigurationTarget.Workspace);
    await cfg.update('gcalSync.clientId', undefined, vscode.ConfigurationTarget.Global);
}
