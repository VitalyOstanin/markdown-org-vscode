import * as vscode from 'vscode';
import { suite, test } from 'mocha';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { formatDurationHM, formatOrgTimestamp } from '../../utils';
import {
    sleep,
    hideSidePanels,
    forceEnglishWeekdays,
    applyMonokaiTheme,
    captureScreenshot,
    maximizeVscodeWindow,
    runCommandViaPalette
} from './_helpers';

/**
 * Open VSX / README screenshots. Unlike the four scenario demos, this
 * suite does not record a video -- it just stages each view that the
 * Open VSX listing should advertise and snaps a single PNG of the
 * current X11 display.
 *
 * The screenshots scenario uses the Monokai theme so the PNGs read as
 * "Markdown Org has a personality", not as "another extension on a stock
 * Dark+ background".
 */
function clockEntry(start: Date, end: Date): string {
    const startStr = formatOrgTimestamp(start, 'square', 'en');
    const endStr = formatOrgTimestamp(end, 'square', 'en');
    const duration = formatDurationHM(end.getTime() - start.getTime(), {
        padHoursWithSpace: true
    });
    return `\`CLOCK: ${startStr}--${endStr} => ${duration}\``;
}

function atTime(base: Date, hour: number, minute: number): Date {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
}

function addDays(base: Date, days: number): Date {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

suite('Demo: Screenshots', () => {
    test('agenda day/week/month + clocktable + editor', async function () {
        this.timeout(120000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }
        const wsDir = workspaceFolder.uri.fsPath;
        const today = new Date();
        const yesterday = addDays(today, -1);

        // Build an org-style active timestamp `<YYYY-MM-DD Day [HH:MM] [repeater]>`.
        // Weekday and repeater go INSIDE the angle brackets -- that is the
        // canonical org-mode grammar (markdown-org-extract also rejects a
        // repeater outside the brackets).
        const iso = (offsetDays: number, opts?: { hour?: number; minute?: number; repeater?: string }): string => {
            const d = new Date(today);
            d.setDate(d.getDate() + offsetDays);
            const date = d.toISOString().slice(0, 10);
            const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
            const pieces = [`${date} ${weekday}`];
            if (opts?.hour !== undefined && opts?.minute !== undefined) {
                const hh = String(opts.hour).padStart(2, '0');
                const mm = String(opts.minute).padStart(2, '0');
                pieces.push(`${hh}:${mm}`);
            }
            if (opts?.repeater) {
                pieces.push(opts.repeater);
            }
            return `<${pieces.join(' ')}>`;
        };

        const planningFile = path.join(wsDir, 'planning.md');
        await fs.writeFile(
            planningFile,
            '# Sprint Plan\n' +
                '\n' +
                '## TODO [#A] Review pull requests\n' +
                `\`SCHEDULED: ${iso(0, { hour: 10, minute: 0 })}\`\n` +
                '\n' +
                '## TODO Pairing session\n' +
                `\`SCHEDULED: ${iso(1, { hour: 14, minute: 0 })}\`\n` +
                '\n' +
                '## TODO [#B] Architecture sync\n' +
                `\`SCHEDULED: ${iso(2)}\`\n` +
                '\n' +
                '## TODO Quarterly demo\n' +
                `\`DEADLINE: ${iso(6)}\`\n` +
                '\n' +
                '## TODO Daily standup\n' +
                `\`SCHEDULED: ${iso(0, { hour: 9, minute: 30, repeater: '+1d' })}\`\n`,
            'utf-8'
        );

        const personalFile = path.join(wsDir, 'personal.md');
        await fs.writeFile(
            personalFile,
            '# Personal\n' +
                '\n' +
                '## TODO Dentist visit\n' +
                `\`SCHEDULED: ${iso(3, { hour: 9, minute: 30 })}\`\n` +
                '\n' +
                '## TODO Pay utility bills\n' +
                `\`DEADLINE: ${iso(5)}\`\n`,
            'utf-8'
        );

        const trackingFile = path.join(wsDir, 'time-tracking.md');
        await fs.writeFile(
            trackingFile,
            '# Time Tracking\n' +
                '\n' +
                '## DONE Implement caching layer\n' +
                clockEntry(atTime(yesterday, 10, 0), atTime(yesterday, 11, 30)) +
                '\n' +
                clockEntry(atTime(yesterday, 14, 0), atTime(yesterday, 15, 45)) +
                '\n' +
                '\n' +
                '## DONE Write API documentation\n' +
                clockEntry(atTime(yesterday, 16, 0), atTime(yesterday, 17, 15)) +
                '\n' +
                '\n' +
                '## TODO Refactor authentication\n' +
                clockEntry(atTime(today, 9, 30), atTime(today, 11, 0)) +
                '\n' +
                '\n' +
                '## Clock Report\n' +
                '\n' +
                '| Heading                     | Time |\n' +
                '|-----------------------------|------|\n' +
                '| Implement caching layer     | 3:15 |\n' +
                '| Write API documentation     | 1:15 |\n' +
                '| Refactor authentication     | 1:30 |\n' +
                '|-----------------------------|------|\n' +
                '| **Total**                   | **6:00** |\n',
            'utf-8'
        );

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', wsDir, vscode.ConfigurationTarget.Workspace);

        await forceEnglishWeekdays();
        // applyMonokaiTheme now waits for VS Code's active-theme event, so
        // by the time control returns the editor has already recoloured.
        await applyMonokaiTheme();

        // 1. Editor view: planning.md is the most representative source file.
        const planningDoc = await vscode.workspace.openTextDocument(planningFile);
        await vscode.window.showTextDocument(planningDoc);
        await hideSidePanels();
        await vscode.commands.executeCommand('notifications.clearAll');
        // Stretch the window to the full Xvfb resolution AFTER side panels
        // are collapsed -- without `--sync`, closing the sidebar could race
        // the resize and leave a wide black border around the chrome.
        await maximizeVscodeWindow();
        await sleep(1500);
        await captureScreenshot('editor-markdown');

        // 2. Agenda Day.
        await runCommandViaPalette('Markdown Org Show Agenda Day');
        await sleep(2200);
        await captureScreenshot('agenda-day');

        // 3. Agenda Week.
        await runCommandViaPalette('Markdown Org Show Agenda Week');
        await sleep(2200);
        await captureScreenshot('agenda-week');

        // 4. Agenda Month.
        await runCommandViaPalette('Markdown Org Show Agenda Month');
        await sleep(2200);
        await captureScreenshot('agenda-month');

        // 5. Clocktable: the file already contains the rendered table, just
        //    open it and scroll to the bottom so the table is centred in the
        //    viewport.
        const trackingDoc = await vscode.workspace.openTextDocument(trackingFile);
        const trackingEditor = await vscode.window.showTextDocument(trackingDoc);
        const lastLine = trackingEditor.document.lineCount - 1;
        trackingEditor.selection = new vscode.Selection(lastLine, 0, lastLine, 0);
        trackingEditor.revealRange(new vscode.Range(lastLine, 0, lastLine, 0));
        await sleep(900);
        await captureScreenshot('clocktable');
    });
});
