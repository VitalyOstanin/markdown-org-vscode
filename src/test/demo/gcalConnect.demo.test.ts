import * as vscode from 'vscode';
import { suite, test } from 'mocha';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as sinon from 'sinon';
import { connectGcal } from '../../commands/gcalSync';
import {
    sleep,
    markDemoStart,
    hideSidePanels,
    enableScreencast,
    forceEnglishWeekdays,
    applyMonokaiTheme,
    maximizeVscodeWindow,
    typeText
} from './_helpers';
import { installFakeGcal, seedGcalSettings, clearGcalSettings } from './_gcalStubs';

/** GET a URL via raw node:http so it reaches the loopback server even though
 *  globalThis.fetch is stubbed for the rest of the flow. */
function hit(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            res.resume();
            res.on('end', () => resolve());
        }).on('error', reject);
    });
}

/**
 * Records "Connect Google Calendar": the client-secret prompt, the
 * "Connecting…" progress notification, and the final "Connected" toast. The
 * browser step is faked -- openExternal is intercepted and the loopback redirect
 * is fired with a fake authorization code, so no real Google round-trip occurs.
 */
suite('Demo: Connect Google Calendar', () => {
    test('client-secret prompt, connecting, connected', async function () {
        this.timeout(90000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }
        const wsDir = workspaceFolder.uri.fsPath;
        const backdrop = path.join(wsDir, 'notes.md');
        await fs.writeFile(backdrop, '# Notes\n\n## TODO Plan the week\n`SCHEDULED: <2026-06-02>`\n', 'utf-8');

        // connected:false -> no stored credentials, so connect prompts for the
        // client secret and persists fresh tokens (the token endpoint returns a
        // refresh_token).
        const fake = installFakeGcal({ latencyMs: 400, connected: false });
        await seedGcalSettings(wsDir);

        // Intercept the browser hand-off and remember the authorization URL so we
        // can drive the loopback redirect ourselves.
        let authUrl: string | undefined;
        const openExternalStub = sinon.stub(vscode.env, 'openExternal').callsFake((target: vscode.Uri) => {
            authUrl = target.toString(true);
            return Promise.resolve(true);
        });

        const document = await vscode.workspace.openTextDocument(backdrop);
        await vscode.window.showTextDocument(document);

        await applyMonokaiTheme();
        await hideSidePanels();
        await forceEnglishWeekdays();
        await sleep(800);
        await maximizeVscodeWindow();
        await sleep(1200);
        await vscode.commands.executeCommand('notifications.clearAll');
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await enableScreencast();
        await sleep(1000);
        await maximizeVscodeWindow();
        await sleep(500);
        await markDemoStart();
        await sleep(700);

        try {
            // connectGcal blocks on the secret prompt, then the loopback redirect,
            // and finally shows a button-less "Connected" info toast whose promise
            // does not resolve under headless Xvfb -- so we never await `running`.
            // Swallow the dangling promise; the credentials are stored and the
            // toast shown well before that final await.
            const running = connectGcal(fake.context);
            running.catch(() => {});

            // Fill the client-secret password prompt the way a user would.
            await sleep(1600);
            await typeText('demo-client-secret', true);

            // Once runConnect opens the browser, simulate Google redirecting back
            // to the loopback server with an authorization code + matching state.
            const deadline = Date.now() + 10000;
            while (!authUrl && Date.now() < deadline) {
                await sleep(100);
            }
            if (!authUrl) {
                throw new Error('connect never opened the external auth URL');
            }
            const parsed = new URL(authUrl);
            const redirectUri = parsed.searchParams.get('redirect_uri');
            const state = parsed.searchParams.get('state');
            if (!redirectUri || !state) {
                throw new Error(`auth URL missing redirect_uri/state: ${authUrl}`);
            }
            const cb = new URL(redirectUri);
            cb.searchParams.set('code', 'demo-auth-code');
            cb.searchParams.set('state', state);
            await sleep(700);
            await hit(cb.toString());

            // Let the "Connected to Google Calendar." toast land.
            await sleep(2600);
        } finally {
            openExternalStub.restore();
            await fake.restore();
            await clearGcalSettings();
        }
    });
});
