import * as vscode from 'vscode';
import { suite, test } from 'mocha';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { selectCalendar } from '../../commands/gcalSync';
import {
    sleep,
    markDemoStart,
    hideSidePanels,
    enableScreencast,
    forceEnglishWeekdays,
    applyMonokaiTheme,
    maximizeVscodeWindow,
    focusVscodeWindow,
    pressKeyInPicker,
    typeText
} from './_helpers';
import { installFakeGcal, seedGcalSettings, clearGcalSettings } from './_gcalStubs';

/**
 * Records "Select Google Calendar": the QuickPick listing the user's writable
 * calendars (plus the create-new option), then picking one. The calendar list
 * is faked; the QuickPick and the confirmation toast are the real UI.
 */
suite('Demo: Select Google Calendar', () => {
    test('QuickPick of writable calendars', async function () {
        this.timeout(90000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }
        const wsDir = workspaceFolder.uri.fsPath;
        const backdrop = path.join(wsDir, 'notes.md');
        await fs.writeFile(backdrop, '# Notes\n\n## TODO Plan the week\n`SCHEDULED: <2026-06-02>`\n', 'utf-8');

        const fake = installFakeGcal({
            latencyMs: 450,
            calendars: [
                { id: 'personal@example.com', summary: 'Personal', accessRole: 'owner' },
                { id: 'team@example.com', summary: 'Work', accessRole: 'writer' },
                { id: 'mdorg@group.calendar.google.com', summary: 'markdown-org', accessRole: 'owner' }
            ]
        });
        await seedGcalSettings(wsDir);

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
            // Focus the window once before the picker opens so the picker keeps
            // keyboard focus; navigation below must not re-activate the window.
            await focusVscodeWindow();

            // selectCalendar awaits showQuickPick; drive the pick from the keyboard.
            // It ends on a button-less info toast whose promise does not resolve
            // under headless Xvfb, so we never await `running` -- the pick and the
            // toast both happen before that await. Swallow the dangling promise.
            const running = selectCalendar(fake.context);
            running.catch(() => {});

            // Wait for the calendar list to load (token + calendarList fetch) and
            // the QuickPick to render, then hold it on screen so viewers can read
            // the options before the selection moves.
            await sleep(3500);

            // Type to filter the list down to a single match, then accept it.
            // Typing/Enter go through the no-activation helpers so they land in
            // the open picker rather than the editor.
            await typeText('Work');
            await sleep(2400);
            await pressKeyInPicker('Return');
            await sleep(2800);
        } finally {
            await fake.restore();
            await clearGcalSettings();
        }
    });
});
