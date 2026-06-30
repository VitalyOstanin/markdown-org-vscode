import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { TokenStore } from '../utils/gcal/tokenStore';
import { startLoopbackServer } from '../utils/gcal/loopback';
import { runConnect, runDisconnect } from '../utils/gcal/connect';
import { createAccessTokenProvider } from '../utils/gcal/accessToken';
import { defaultDbusRun } from '../utils/gcal/dbus';
import {
    listGoaGoogleAccounts,
    resolveGoaAccount,
    createGoaAccessTokenProvider,
    type GoaAccount
} from '../utils/gcal/goa';
import { chooseAuthProvider, type AuthProviderSetting, type ResolvedAuthProvider } from '../utils/gcal/authProvider';
import type { AccessTokenProvider } from '../utils/gcal/accessToken';
import { listWritableCalendars, ensureCalendar } from '../utils/gcal/calendarClient';
import { SingleFlight, type ConcurrencyPolicy } from '../utils/gcal/mutex';
import { acquireLock } from '../utils/gcal/lock';
import {
    runSync,
    type PropertiesWriter,
    type SyncDeps,
    type SyncSummary,
    type SyncChange
} from '../utils/gcal/syncEngine';
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

const DEFAULT_CALENDAR_NAME = 'markdown-org';

/** The configured sync calendar name, falling back to DEFAULT_CALENDAR_NAME. */
function calendarNameSetting(cfg: vscode.WorkspaceConfiguration): string {
    return (cfg.get<string>('gcalSync.calendarName') ?? DEFAULT_CALENDAR_NAME).trim() || DEFAULT_CALENDAR_NAME;
}

/** Resolve the effective auth provider and (for GOA) the available accounts.
 *  Throws a user-facing error when the chosen provider cannot be used. Under an
 *  explicit `goa` setting a DBus/busctl failure surfaces (rather than masking as
 *  "no account"); under `auto` it degrades silently to OAuth. */
async function resolveProviderAndAccounts(
    cfg: vscode.WorkspaceConfiguration
): Promise<{ provider: ResolvedAuthProvider; accounts: GoaAccount[]; setting: AuthProviderSetting }> {
    const setting = (cfg.get<string>('gcalSync.authProvider') ?? 'auto') as AuthProviderSetting;
    let accounts: GoaAccount[] = [];
    if (setting !== 'oauth' && process.platform === 'linux') {
        try {
            accounts = await listGoaGoogleAccounts(defaultDbusRun);
        } catch (e) {
            // Under explicit 'goa' a transient DBus/busctl failure must surface,
            // not be masked as "no account". Under 'auto' it is graceful
            // degradation to OAuth.
            if (setting === 'goa') {
                throw new Error(
                    `failed to query GNOME Online Accounts: ${e instanceof Error ? e.message : String(e)}`,
                    { cause: e }
                );
            }
            accounts = [];
        }
    }
    const { provider, error } = chooseAuthProvider({
        setting,
        platform: process.platform,
        hasGoaGoogleAccount: accounts.length > 0
    });
    if (error) {
        throw new Error(error);
    }
    return { provider, accounts, setting };
}

/** Resolve the access-token provider for the current settings/platform.
 *  Throws a user-facing error when the chosen provider cannot be used. */
async function resolveTokenProvider(
    context: vscode.ExtensionContext,
    cfg: vscode.WorkspaceConfiguration
): Promise<AccessTokenProvider> {
    const { provider, accounts } = await resolveProviderAndAccounts(cfg);
    if (provider === 'goa') {
        const want = (cfg.get<string>('gcalSync.goaAccount') ?? '').trim();
        const res = resolveGoaAccount(accounts, want);
        if (res.error) {
            throw new Error(
                `${res.error} — add a Google account in GNOME Settings → Online Accounts (enable Calendar), ` +
                    `or set markdown-org.gcalSync.authProvider to "oauth"`
            );
        }
        if (res.needsPick || !res.account) {
            throw new Error(
                'multiple Google accounts in GNOME Online Accounts — run "Connect Google Calendar" to choose one, ' +
                    'or set markdown-org.gcalSync.goaAccount'
            );
        }
        return createGoaAccessTokenProvider({ run: defaultDbusRun, accountPath: res.account.path });
    }
    const clientId = clientIdSetting();
    if (!clientId) {
        throw new Error('set markdown-org.gcalSync.clientId and run Connect first');
    }
    const tokens = new TokenStore(context.secrets);
    return createAccessTokenProvider({ clientId, tokens, fetchFn: fetch });
}

/** Connect Google Calendar. Provider-aware: GOA selects an Online Accounts
 *  Google account; OAuth runs the BYO loopback+PKCE flow. */
export async function connectGcal(context: vscode.ExtensionContext): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    const { provider, accounts } = await resolveProviderAndAccounts(cfg);
    if (provider === 'goa') {
        await connectGoa(cfg, accounts);
        return;
    }
    await connectOAuth(context);
}

/** GOA connect: pick the account (when several) and persist its email. */
async function connectGoa(cfg: vscode.WorkspaceConfiguration, accounts: GoaAccount[]): Promise<void> {
    if (accounts.length === 0) {
        throw new Error(
            'no Google account in GNOME Online Accounts — add one in GNOME Settings → Online Accounts (enable Calendar)'
        );
    }
    let email = accounts[0].email;
    if (accounts.length > 1) {
        const chosen = await vscode.window.showQuickPick(
            accounts.map((a) => ({ label: a.email })),
            { title: 'Select GNOME Online Accounts Google account for sync', ignoreFocusOut: true }
        );
        if (!chosen) {
            return;
        }
        email = chosen.label;
    }
    await cfg.update('gcalSync.goaAccount', email, vscode.ConfigurationTarget.Global);
    await notifyInfo(`Connected to Google Calendar via GNOME Online Accounts (${email}).`);
}

/** Connect Google Calendar: BYO Desktop client, loopback + PKCE. */
async function connectOAuth(context: vscode.ExtensionContext): Promise<void> {
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
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    const setting = (cfg.get<string>('gcalSync.authProvider') ?? 'auto') as AuthProviderSetting;
    // Under GOA there is no stored secret we own; clear the pinned account.
    if (setting === 'goa' || (setting === 'auto' && process.platform === 'linux')) {
        await cfg.update('gcalSync.goaAccount', '', vscode.ConfigurationTarget.Global);
    }
    await runDisconnect({ tokens: new TokenStore(context.secrets) });
    await notifyInfo('Disconnected from Google Calendar.');
}

/** Pick (or create) the Google Calendar used for sync; writes calendarId. */
export async function selectCalendar(context: vscode.ExtensionContext): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    const calendarName = calendarNameSetting(cfg);
    const getToken = await resolveTokenProvider(context, cfg);

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

// How many changed events to list inline in the summary toast; the rest are
// only in the details channel (a toast with hundreds of lines is unusable).
const SYNC_TOAST_LIMIT = 5;
const HEADING_MAX = 40;
// Compact glyphs for the toast. Only created/updated/deleted are shown there;
// deferred/failed appear (spelled out) in the details channel.
const TOAST_SYMBOL: Record<SyncChange['action'], string> = {
    created: '+',
    updated: '~',
    deleted: '-',
    deferred: '?',
    failed: '!'
};

// Lazily-created output channel holding the full per-run event list (history
// across runs). Opened on demand via the toast's "Show details" button.
let syncChannel: vscode.OutputChannel | undefined;
function getSyncChannel(): vscode.OutputChannel {
    if (!syncChannel) {
        syncChannel = vscode.window.createOutputChannel('Markdown Org: Calendar Sync');
    }
    return syncChannel;
}

function truncateHeading(heading: string): string {
    const s = heading.trim();
    return s.length > HEADING_MAX ? `${s.slice(0, HEADING_MAX - 1)}…` : s;
}

/** Toast line: glyph + date + truncated heading, e.g. `+ 2026-05-28 Meeting…`. */
function toastLine(c: SyncChange): string {
    return `${TOAST_SYMBOL[c.action]} ${c.date ?? '—'} ${truncateHeading(c.heading)}`;
}

/**
 * Compact, toast-friendly counts: only the non-zero categories, comma-joined
 * (e.g. `3 created, 1 deleted`). VS Code notification toasts collapse newlines
 * to spaces, so the whole summary has to read on a single (word-wrapped) line;
 * dropping the zero categories keeps it short. Falls back to `no changes` when
 * the sync touched nothing.
 */
function compactCounts(summary: SyncSummary): string {
    const parts: string[] = [];
    const add = (n: number, label: string): void => {
        if (n > 0) {
            parts.push(`${n} ${label}`);
        }
    };
    add(summary.created, 'created');
    add(summary.updated, 'updated');
    add(summary.deleted, 'deleted');
    add(summary.skipped, 'skipped');
    add(summary.deferred, 'deferred');
    add(summary.failed, 'failed');
    return parts.length > 0 ? parts.join(', ') : 'no changes';
}

/** Channel line: spelled-out action + date + full heading. */
function channelLine(c: SyncChange): string {
    return `  ${c.action.padEnd(7)} ${c.date ?? '—'}  ${c.heading.trim()}`;
}

/** What invoked syncNow: a user action vs. an automatic save trigger. */
export type SyncTrigger = 'manual' | 'onSave';

/**
 * Report a finished sync: append the full per-run list to the details channel,
 * then -- depending on the trigger -- show a summary toast with up to
 * SYNC_TOAST_LIMIT changed events (created/updated/deleted). The toast's
 * "Show details" button reveals the channel. notifyInfo is deliberately not
 * used: this needs an action button.
 *
 * Toast policy:
 *   * `manual`  -- always show the summary toast (the user asked for it).
 *   * `onSave`  -- silent on success / `no changes` (background automation);
 *                  toast only when `failed > 0` so the user notices breakage.
 * The details channel is appended in both cases, so the full per-event log
 * is always reachable from the **Calendar Sync** output channel.
 */
async function reportSyncSummary(summary: SyncSummary, trigger: SyncTrigger): Promise<void> {
    const counts =
        `${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ` +
        `${summary.skipped} skipped, ${summary.deferred} deferred, ${summary.failed} failed`;

    const channel = getSyncChannel();
    channel.appendLine(`[${new Date().toLocaleTimeString()}] sync (${trigger}): ${counts}`);
    for (const c of summary.changes) {
        channel.appendLine(channelLine(c));
    }

    // Background on-save runs stay silent unless something failed: a toast on
    // every save is spam (no-ops are common, the spinner already signalled the
    // run, and the channel keeps the log). Failures still surface so a broken
    // token / network issue is visible.
    if (trigger === 'onSave' && summary.failed === 0) {
        return;
    }

    const changed = summary.changes.filter(
        (c) => c.action === 'created' || c.action === 'updated' || c.action === 'deleted'
    );
    const shown = changed.slice(0, SYNC_TOAST_LIMIT).map(toastLine);
    const more = changed.length - shown.length;
    // One line, ` · `-separated: counts first, then the changed events. Toasts
    // collapse `\n`, so a multi-line list would render as a run-on paragraph --
    // the full per-event log lives in the details channel instead.
    const segments = [`Calendar sync — ${compactCounts(summary)}`, ...shown];
    if (more > 0) {
        segments.push(`…and ${more} more`);
    }

    const DETAILS = 'Show details';
    const pick = await vscode.window.showInformationMessage(`Markdown Org: ${segments.join(' · ')}`, DETAILS);
    if (pick === DETAILS) {
        channel.show(true);
    }
}

/**
 * Run the extractor in `--tasks` mode over `dir` and parse its JSON task list.
 * Mirrors the agenda invocation (`--dir <dir> --format json --absolute-paths
 * --tasks`) so paths come back absolute and properties are included.
 *
 * `--tasks-include-done` and `--tasks-include-cancelled` surface DONE and
 * CANCELLED tasks as well (the flat list is TODO-only by default). The sync
 * needs both: a task that became DONE must still reach the engine so its event
 * can be deleted (`onDone=delete`) or kept (`onDone=keep`); a task that became
 * CANCELLED must reach the engine so its event is always deleted (CANCELLED is
 * never published). Without these flags such a task simply vanishes from the
 * list and its event is orphaned (never deleted).
 */
function runExtractorTasks(extractorPath: string, dir: string): Promise<Task[]> {
    const args = [
        '--dir',
        dir,
        '--format',
        'json',
        '--absolute-paths',
        '--tasks',
        '--tasks-include-done',
        '--tasks-include-cancelled'
    ];
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
                    // Unlike the agenda path (which runs normalizeAgendaTaskTypes),
                    // the sync path leaves task_type raw on purpose: runSync only
                    // reads it via isCancelled(...) (matches both spellings on the
                    // raw string) and an exact `=== 'DONE'` check, so a value not in
                    // TaskStatus behaves exactly as a normalized `undefined` would.
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

/**
 * Sync now: push tasks to the configured Google Calendar.
 *
 * `opts.trigger` controls the post-run summary toast (see `reportSyncSummary`):
 *   * `'manual'` (default) -- summary toast always shown.
 *   * `'onSave'`            -- silent on success; toast only when `failed > 0`.
 * The status-bar spinner and the **Calendar Sync** output channel are the
 * same for both triggers.
 */
export async function syncNow(context: vscode.ExtensionContext, opts: { trigger?: SyncTrigger } = {}): Promise<void> {
    const trigger: SyncTrigger = opts.trigger ?? 'manual';
    if (!vscode.workspace.isTrusted) {
        await notifyWarn('Google Calendar sync is disabled in untrusted workspaces');
        return;
    }
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    const getToken = await resolveTokenProvider(context, cfg);
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
    // itself when the promise settles. The summary toast is shown *after* this
    // wrapper resolves: notifyInfo's promise only settles when the user
    // dismisses the toast, so awaiting it inside withProgress would keep the
    // spinner turning until then.
    let summary: SyncSummary | undefined;
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
                    const calendarName = calendarNameSetting(cfg);
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
                    summary = await runSync(deps);
                } finally {
                    await lock.release();
                }
            })
    );

    if (summary) {
        await reportSyncSummary(summary, trigger);
    }
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
                // Background automation: silent on success/no-changes, toast
                // only on failures. See reportSyncSummary's toast policy.
                void syncNow(context, { trigger: 'onSave' }).catch(() => {});
            }, delay);
        }
        debounced();
    });
    context.subscriptions.push(sub);
}
