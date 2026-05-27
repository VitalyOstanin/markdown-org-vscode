import * as vscode from 'vscode';
import { TokenStore } from '../utils/gcal/tokenStore';
import { startLoopbackServer } from '../utils/gcal/loopback';
import { runConnect, runDisconnect } from '../utils/gcal/connect';
import { createAccessTokenProvider } from '../utils/gcal/accessToken';
import { listWritableCalendars, ensureCalendar } from '../utils/gcal/calendarClient';
import { notifyInfo } from '../utils/notify';

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
