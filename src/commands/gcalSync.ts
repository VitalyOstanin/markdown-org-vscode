import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { TokenStore } from '../utils/gcal/tokenStore';
import { startLoopbackServer } from '../utils/gcal/loopback';
import { runConnect, runDisconnect } from '../utils/gcal/connect';
import { createAccessTokenProvider } from '../utils/gcal/accessToken';
import { listWritableCalendars, ensureCalendar } from '../utils/gcal/calendarClient';
import { SingleFlight, type ConcurrencyPolicy } from '../utils/gcal/mutex';
import { acquireLock } from '../utils/gcal/lock';
import { runSync, type PropertiesWriter, type SyncDeps } from '../utils/gcal/syncEngine';
import type { MapOptions } from '../utils/gcal/eventMapping';
import { computeOrgPropertiesEdit } from '../utils/orgProperties';
import { HEADING_REGEX } from '../orgPatterns';
import { EXTRACTOR_MAX_BUFFER_BYTES, EXTRACTOR_TIMEOUT_MS, extractor } from '../utils/extractor';
import { exec } from '../utils/exec';
import { buildExecError } from '../utils/execError';
import type { Task } from '../types';
import { notifyInfo, notifyWarn } from '../utils/notify';
import { debounce, type DebouncedFunction } from '../utils/debounce';

const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;

function clientIdSetting(): string {
    return (vscode.workspace.getConfiguration('markdown-org').get<string>('gcalSync.clientId') ?? '').trim();
}

/** Connect Google Calendar: BYO Desktop client, loopback + PKCE. */
export async function connectGcal(context: vscode.ExtensionContext): Promise<void> {
    let clientId = clientIdSetting();
    if (!clientId) {
        clientId =
            (
                await vscode.window.showInputBox({
                    title: 'Google OAuth Client ID',
                    prompt: 'Desktop OAuth client_id from your Google Cloud project',
                    ignoreFocusOut: true
                })
            )?.trim() ?? '';
        if (!clientId) {
            // User dismissed the client-id prompt before committing: abort quietly,
            // no error toast. (A cancelled client-secret prompt below, mid-flow,
            // intentionally throws instead — see there.)
            return;
        }
        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('gcalSync.clientId', clientId, vscode.ConfigurationTarget.Global);
    }

    const tokens = new TokenStore(context.secrets);
    // The connect flow waits up to CONNECT_TIMEOUT_MS for the browser redirect;
    // show a progress notification so a stuck flow (tab closed, never authorized)
    // is visible until it resolves or times out.
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Connecting to Google Calendar…',
            cancellable: false
        },
        () =>
            runConnect({
                clientId,
                getClientSecret: async () => {
                    const existing = await tokens.getClientSecret();
                    if (existing) {
                        return existing;
                    }
                    const secret = (
                        await vscode.window.showInputBox({
                            title: 'Google OAuth Client Secret',
                            prompt: 'Desktop OAuth client_secret (stored in the OS keychain via SecretStorage)',
                            password: true,
                            ignoreFocusOut: true
                        })
                    )?.trim();
                    if (!secret) {
                        // Mid-flow cancel: surface as an error so the user sees why
                        // connect stopped (unlike the quiet client-id abort above).
                        throw new Error('client secret is required to connect');
                    }
                    return secret;
                },
                startLoopback: startLoopbackServer,
                openExternal: async (url) => {
                    await vscode.env.openExternal(vscode.Uri.parse(url));
                },
                fetchFn: fetch,
                tokens,
                timeoutMs: CONNECT_TIMEOUT_MS
            })
    );
    await notifyInfo('Connected to Google Calendar.');
}

/** Disconnect Google Calendar: clear stored credentials. The `gcalSync.clientId`
 *  setting is intentionally left in place — it is not a secret and is reused on
 *  reconnect (which then only re-prompts for the client secret). */
export async function disconnectGcal(context: vscode.ExtensionContext): Promise<void> {
    await runDisconnect({ tokens: new TokenStore(context.secrets) });
    await notifyInfo('Disconnected from Google Calendar.');
}

/** Pick (or create) the Google Calendar used for sync; writes calendarId. */
export async function selectCalendar(context: vscode.ExtensionContext): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    const clientId = clientIdSetting();
    if (!clientId) {
        throw new Error('set markdown-org.gcalSync.clientId and run Connect first');
    }
    const calendarName = (cfg.get<string>('gcalSync.calendarName') ?? 'markdown-org').trim() || 'markdown-org';
    const tokens = new TokenStore(context.secrets);
    const getToken = createAccessTokenProvider({ clientId, tokens, fetchFn: fetch });

    const calendars = await listWritableCalendars(fetch, getToken);
    const createItem = { label: `$(add) Create new calendar "${calendarName}"`, id: '' as string };
    const picks = [createItem, ...calendars.map((c) => ({ label: c.summary, description: c.id, id: c.id }))];
    const chosen = await vscode.window.showQuickPick(picks, {
        title: 'Select Google Calendar for markdown-org sync',
        ignoreFocusOut: true
    });
    if (!chosen) {
        return;
    }
    const calendarId = chosen.id || (await ensureCalendar(fetch, getToken, { name: calendarName }));

    const target =
        (vscode.workspace.workspaceFolders?.length ?? 0) > 0
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
    await cfg.update('gcalSync.calendarId', calendarId, target);
    await notifyInfo(`Calendar set: ${chosen.id ? chosen.label : calendarName}`);
}

// One single-flight runner for the process lifetime: coalesces overlapping
// syncs (manual + on-save) into a single rerun, or cancels the in-flight run
// when the policy is 'cancel'.
let singleFlight: SingleFlight | undefined;

function getSingleFlight(): SingleFlight {
    const policy = (vscode.workspace.getConfiguration('markdown-org').get<string>('gcalSync.concurrencyPolicy') ??
        'queue') as ConcurrencyPolicy;
    if (!singleFlight) {
        singleFlight = new SingleFlight(policy);
    }
    return singleFlight;
}

/**
 * Run the extractor in `--tasks` mode over `dir` and parse its JSON task list.
 * Mirrors the agenda invocation (`--dir <dir> --format json --absolute-paths
 * --tasks`) so paths come back absolute and properties are included.
 *
 * `--tasks-include-done` surfaces DONE tasks as well (the flat list is TODO-only
 * by default). The sync needs them: a task that became DONE must still reach the
 * engine so its event can be deleted (`onDone=delete`) or kept (`onDone=keep`);
 * without the flag the task simply vanishes and its event is orphaned.
 */
function runExtractorTasks(extractorPath: string, dir: string): Promise<Task[]> {
    const args = ['--dir', dir, '--format', 'json', '--absolute-paths', '--tasks', '--tasks-include-done'];
    return new Promise<Task[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Command timeout after ${EXTRACTOR_TIMEOUT_MS / 1000} seconds`));
        }, EXTRACTOR_TIMEOUT_MS);
        exec.execFile(
            extractorPath,
            args,
            { encoding: 'utf-8', maxBuffer: EXTRACTOR_MAX_BUFFER_BYTES },
            (error, stdout, stderr) => {
                clearTimeout(timeout);
                if (error) {
                    reject(buildExecError(error, stderr, 'Unknown error'));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout) as Task[]);
                } catch (e) {
                    reject(e instanceof Error ? e : new Error(String(e)));
                }
            }
        );
    });
}

/**
 * A PropertiesWriter backed by a targeted WorkspaceEdit. Refuses (returns
 * 'deferred') when the file has unsaved edits or the line no longer anchors
 * the expected heading -- the sync engine then retries on a later run rather
 * than writing to a shifted/dirty file.
 *
 * Exported for integration testing: the pure edit computation is unit-tested
 * in orgProperties, but the editor binding (openTextDocument, isDirty guard,
 * heading-anchor guard, applyEdit, save) only runs against a real workspace.
 */
export function makePropertiesWriter(): PropertiesWriter {
    return {
        async write(file, line, expectedHeading, props) {
            const uri = vscode.Uri.file(file);
            const doc = await vscode.workspace.openTextDocument(uri);
            if (doc.isDirty) {
                return 'deferred';
            }
            const lines = doc.getText().split(/\r?\n/);
            const headingIdx = line - 1;
            const m = headingIdx >= 0 && headingIdx < lines.length ? HEADING_REGEX.exec(lines[headingIdx]) : null;
            if (!m || (m.groups?.title ?? '').trim() !== expectedHeading.trim()) {
                return 'deferred';
            }
            const e = computeOrgPropertiesEdit(lines, headingIdx, props);
            const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
            const joined = e.blockLines.join(eol);
            const edit = new vscode.WorkspaceEdit();
            if (e.endLineExclusive > e.startLine) {
                if (e.endLineExclusive < doc.lineCount) {
                    edit.replace(uri, new vscode.Range(e.startLine, 0, e.endLineExclusive, 0), joined + eol);
                } else {
                    const lastEnd = doc.lineAt(doc.lineCount - 1).range.end;
                    edit.replace(uri, new vscode.Range(new vscode.Position(e.startLine, 0), lastEnd), joined);
                }
            } else if (e.startLine < doc.lineCount) {
                edit.insert(uri, new vscode.Position(e.startLine, 0), joined + eol);
            } else {
                const last = doc.lineAt(doc.lineCount - 1);
                const lead = last.text.length > 0 ? eol : '';
                edit.insert(uri, last.range.end, lead + joined);
            }
            const applied = await vscode.workspace.applyEdit(edit);
            if (!applied) {
                return 'deferred';
            }
            return (await doc.save()) ? 'written' : 'deferred';
        }
    };
}

/** Per-workspace lock file path under the extension's global storage. */
async function lockPathFor(context: vscode.ExtensionContext, workspaceDir: string): Promise<string> {
    const dir = context.globalStorageUri.fsPath;
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    const key = createHash('sha256').update(workspaceDir).digest('hex').slice(0, 16);
    return path.join(dir, `gcal-sync-${key}.lock`);
}

/** Sync now: push tasks to the configured Google Calendar. */
export async function syncNow(context: vscode.ExtensionContext): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        await notifyWarn('Google Calendar sync is disabled in untrusted workspaces');
        return;
    }
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    const clientId = (cfg.get<string>('gcalSync.clientId') ?? '').trim();
    if (!clientId) {
        throw new Error('set markdown-org.gcalSync.clientId and run Connect first');
    }
    const workspaceDir = cfg.get<string>('workspaceDir') || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
        throw new Error('open a workspace folder or set markdown-org.workspaceDir');
    }
    const extractorPath = await extractor.resolveExtractorPath();
    if (!extractorPath) {
        // resolveExtractorPath already surfaced a user-facing error toast.
        return;
    }
    // Show a status-bar spinner for the whole run so a sync (manual or
    // on-save) is visibly "in progress" rather than silent until the final
    // toast. ProgressLocation.Window renders `$(sync~spin) <title>` and clears
    // itself when the promise settles.
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Markdown Org: syncing Google Calendar…' },
        () =>
            getSingleFlight().run(async (signal) => {
                const lockPath = await lockPathFor(context, workspaceDir);
                const lock = await acquireLock({ path: lockPath });
                if (!lock) {
                    await notifyWarn('another Google Calendar sync is already running');
                    return;
                }
                try {
                    const tokens = new TokenStore(context.secrets);
                    const getToken = createAccessTokenProvider({ clientId, tokens, fetchFn: fetch });
                    const calendarName =
                        (cfg.get<string>('gcalSync.calendarName') ?? 'markdown-org').trim() || 'markdown-org';
                    const pinnedId = (cfg.get<string>('gcalSync.calendarId') ?? '').trim() || undefined;
                    const calendarId = await ensureCalendar(fetch, getToken, { name: calendarName, pinnedId });
                    const tasks = await runExtractorTasks(extractorPath, workspaceDir);
                    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    const defaultEventMinutes = cfg.get<number>('gcalSync.defaultEventMinutes') ?? 60;
                    const onDone = (cfg.get<string>('gcalSync.onDone') ?? 'delete') === 'keep' ? 'keep' : 'delete';
                    const deps: SyncDeps = {
                        tasks,
                        fetchFn: fetch,
                        getToken,
                        calendarId,
                        writer: makePropertiesWriter(),
                        genUuid: () => randomUUID(),
                        mapOptions: (t): MapOptions => ({
                            timeZone,
                            defaultEventMinutes,
                            relPath: path.relative(workspaceDir, t.file) || t.file
                        }),
                        onDone,
                        signal
                    };
                    const s = await runSync(deps);
                    await notifyInfo(
                        `Calendar sync: ${s.created} created, ${s.updated} updated, ${s.deleted} deleted, ` +
                            `${s.skipped} skipped, ${s.deferred} deferred, ${s.failed} failed`
                    );
                } finally {
                    await lock.release();
                }
            })
    );
}

/** Register the optional debounce-on-save trigger (disabled by default). */
export function registerGcalSaveTrigger(context: vscode.ExtensionContext): void {
    let debounced: DebouncedFunction<[]> | undefined;
    const sub = vscode.workspace.onDidSaveTextDocument((doc) => {
        const cfg = vscode.workspace.getConfiguration('markdown-org');
        if (!cfg.get<boolean>('gcalSync.syncOnSave')) {
            return;
        }
        if (doc.languageId !== 'markdown') {
            return;
        }
        const delay = cfg.get<number>('gcalSync.syncOnSaveDebounceMs') ?? 5000;
        if (!debounced) {
            debounced = debounce(() => {
                void syncNow(context).catch(() => {});
            }, delay);
        }
        debounced();
    });
    context.subscriptions.push(sub);
}
