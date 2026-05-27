import * as vscode from 'vscode';
import { suite, test } from 'mocha';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as sinon from 'sinon';
import {
    sleep,
    markDemoStart,
    hideSidePanels,
    enableScreencast,
    forceEnglishWeekdays,
    applyMonokaiTheme,
    maximizeVscodeWindow,
    runCommandViaPalette
} from './_helpers';
import { installFakeGcal, seedGcalSettings, clearGcalSettings, eventIdFromOrgId, type DemoTask } from './_gcalStubs';

/** GET a URL via raw node:http (bypasses the stubbed globalThis.fetch) so the
 *  loopback redirect actually reaches the connect flow's local server. */
function hit(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            res.resume();
            res.on('end', () => resolve());
        }).on('error', reject);
    });
}

/**
 * Records "Sync Now" invoked the way a user does it -- from the Command
 * Palette. The palette runs the real command against the real extension
 * context, so the context is authenticated off-camera first by driving the
 * real Connect command (browser + network faked). On camera: the palette
 * pick, the status-bar spinner, the summary toast, and -- after "Show
 * details" -- the Calendar Sync output channel. Network + extractor are faked;
 * every visible piece is the extension's real UI.
 */
suite('Demo: Google Calendar Sync Now', () => {
    test('palette Sync Now: spinner, summary toast, Show details channel', async function () {
        this.timeout(120000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }
        const wsDir = workspaceFolder.uri.fsPath;
        const planningFile = path.join(wsDir, 'release-plan.md');

        await fs.writeFile(
            planningFile,
            '# Release plan\n' +
                '\n' +
                '## TODO Ship the 0.7 release\n' +
                '`SCHEDULED: <2026-06-02>`\n' +
                '\n' +
                '## TODO Design review with the team\n' +
                '`SCHEDULED: <2026-06-03 14:00>`\n' +
                '\n' +
                '## TODO Submit quarterly report\n' +
                '`DEADLINE: <2026-06-05>`\n' +
                '\n' +
                '## DONE Old daily standup\n' +
                '`SCHEDULED: <2026-06-01 09:00>`\n',
            'utf-8'
        );

        // Each task carries an ID and a matching cached GCAL_EVENT_ID, so the
        // engine's local property write-back is a no-op (the file stays clean)
        // and the run shows pure create/delete activity.
        const withCachedEvent = (orgId: string): Record<string, string> => ({
            ID: orgId,
            GCAL_EVENT_ID: eventIdFromOrgId(orgId)
        });
        const tasks: DemoTask[] = [
            {
                file: planningFile,
                line: 3,
                heading: 'Ship the 0.7 release',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED',
                timestamp_active: true,
                timestamp_date: '2026-06-02',
                properties: withCachedEvent('0a111111-1111-1111-1111-111111111111')
            },
            {
                file: planningFile,
                line: 6,
                heading: 'Design review with the team',
                task_type: 'TODO',
                timestamp_type: 'SCHEDULED',
                timestamp_active: true,
                timestamp_date: '2026-06-03',
                timestamp_time: '14:00',
                properties: withCachedEvent('0b222222-2222-2222-2222-222222222222')
            },
            {
                file: planningFile,
                line: 9,
                heading: 'Submit quarterly report',
                task_type: 'TODO',
                timestamp_type: 'DEADLINE',
                timestamp_active: true,
                timestamp_date: '2026-06-05',
                properties: withCachedEvent('0c333333-3333-3333-3333-333333333333')
            },
            {
                file: planningFile,
                line: 12,
                heading: 'Old daily standup',
                task_type: 'DONE',
                timestamp_type: 'SCHEDULED',
                timestamp_active: true,
                timestamp_date: '2026-06-01',
                timestamp_time: '09:00',
                properties: withCachedEvent('0d444444-4444-4444-4444-444444444444')
            }
        ];

        const fake = installFakeGcal({ tasks, latencyMs: 550, connected: false });
        await seedGcalSettings(wsDir);

        // Off-camera connect needs to fill the secret prompt and intercept the
        // browser hand-off; the loopback redirect is then fired with a fake code.
        let authUrl: string | undefined;
        const openExternalStub = sinon.stub(vscode.env, 'openExternal').callsFake((target: vscode.Uri) => {
            authUrl = target.toString(true);
            return Promise.resolve(true);
        });
        const inputStub = sinon.stub(vscode.window, 'showInputBox').resolves('demo-client-secret');

        const document = await vscode.workspace.openTextDocument(planningFile);
        await vscode.window.showTextDocument(document);

        await applyMonokaiTheme();
        await hideSidePanels();
        await forceEnglishWeekdays();
        await sleep(800);
        await maximizeVscodeWindow();
        await sleep(1000);

        try {
            // Authenticate the real extension context off-camera by running the
            // real Connect command and simulating Google's loopback redirect.
            void vscode.commands.executeCommand('markdown-org.gcalSync.connect');
            const deadline = Date.now() + 10000;
            while (!authUrl && Date.now() < deadline) {
                await sleep(100);
            }
            if (authUrl) {
                const parsed = new URL(authUrl);
                const redirectUri = parsed.searchParams.get('redirect_uri');
                const state = parsed.searchParams.get('state');
                if (redirectUri && state) {
                    const cb = new URL(redirectUri);
                    cb.searchParams.set('code', 'demo-auth-code');
                    cb.searchParams.set('state', state);
                    await hit(cb.toString());
                }
            }
            // Let the code exchange + token storage settle before syncing.
            await sleep(1800);

            await vscode.commands.executeCommand('notifications.clearAll');
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            await enableScreencast();
            await sleep(1000);
            await maximizeVscodeWindow();
            await sleep(500);
            await markDemoStart();
            await sleep(700);

            // On camera: the user runs Sync Now from the Command Palette. This
            // executes the real command against the now-authenticated context.
            // Hold 3s on the highlighted command so viewers see what is run.
            await runCommandViaPalette('Markdown Org Sync Now Google Calendar', 3000);

            // Hold long enough for the status-bar spinner ($(sync~spin)) to run
            // and the summary toast to land and be readable before opening details.
            await sleep(5500);

            // Activate the toast's "Show details" action from the keyboard so the
            // real reportSyncSummary reveals the Calendar Sync channel.
            await vscode.commands.executeCommand('notifications.focusToasts');
            await sleep(400);
            await vscode.commands.executeCommand('notification.acceptPrimaryAction');
            await sleep(3500);
        } finally {
            inputStub.restore();
            openExternalStub.restore();
            await fake.restore();
            await clearGcalSettings();
        }
    });
});
