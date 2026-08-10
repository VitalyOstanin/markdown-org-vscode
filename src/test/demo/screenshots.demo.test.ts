import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { suite, test } from 'mocha';
import { formatDurationHM, formatOrgTimestamp } from '../../utils';
import {
    sleep,
    hideSidePanels,
    forceEnglishWeekdays,
    applyDemoTheme,
    captureScreenshot,
    maximizeVscodeWindow,
    initDemoRepository,
    commitInDemoRepository,
    clickAt,
    moveMouseTo
} from './_helpers';

/**
 * Open VSX / README screenshots. Unlike the four scenario demos, this
 * suite does not record a video -- it just stages each view that the
 * Open VSX listing should advertise and snaps a single PNG of the
 * current X11 display.
 *
 * The scenario runs once per theme (Monokai and Solarized Light, both
 * built in), so the PNGs read as "Markdown Org has a personality" rather
 * than "another extension on a stock Dark+ background", and README can
 * serve each reader the set matching their own colour scheme. The theme
 * and the `-dark` / `-light` file-name suffix come from the driver via
 * MARKDOWN_ORG_DEMO_THEME.
 */
function clockEntry(start: Date, end: Date): string {
    const startStr = formatOrgTimestamp(start, 'square', 'en');
    const endStr = formatOrgTimestamp(end, 'square', 'en');
    const duration = formatDurationHM(end.getTime() - start.getTime(), {
        padHoursWithSpace: true
    });
    return `\`CLOCK: ${startStr}--${endStr} => ${duration}\``;
}

/**
 * Open an agenda view and let the panel finish drawing.
 *
 * The panel spawns the extractor, waits for its JSON, measures the header and
 * only then lays the page out. 2.2 s covered that on an idle machine but not on
 * a loaded one, where a light-theme run photographed an empty panel.
 */
async function showAgenda(view: 'Day' | 'Week' | 'Month'): Promise<void> {
    await vscode.commands.executeCommand(`markdown-org.showAgenda${view}`);
    await sleep(3500);
}

/**
 * The Tasks view, which is a command of its own rather than an agenda mode --
 * it has no date axis to name, so it is `showTasks` and not `showAgendaTasks`.
 */
async function showTasks(): Promise<void> {
    await vscode.commands.executeCommand('markdown-org.showTasks');
    await sleep(3500);
}

function atTime(base: Date, hour: number, minute: number): Date {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
}

function addDays(base: Date, days: number): Date {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

suite('Demo: Screenshots', () => {
    test('agenda day/week/month/tasks + clocktable + editor', async function () {
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
            if (opts?.hour !== undefined && opts.minute !== undefined) {
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
                `\`SCHEDULED: ${iso(0, { hour: 9, minute: 30, repeater: '+1d' })}\`\n` +
                '\n' +
                // A date already behind today. The day and week views place it
                // by its own date; the Tasks view, which dates every row, is
                // where it earns the overdue colour -- so the shot of that view
                // shows what late looks like next to what is merely ahead.
                '## TODO [#A] Send the quarterly report\n' +
                `\`DEADLINE: ${iso(-2, { hour: 10, minute: 0 })}\`\n` +
                '\n' +
                // A cancelled task still shows in the agenda (only DONE is hidden),
                // rendered struck-through -- this is what the CANCELLED status looks
                // like in the day/week views.
                '## CANCELLED Drop deprecated endpoint\n' +
                `\`SCHEDULED: ${iso(0, { hour: 16, minute: 0 })}\`\n`,
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

        // Stage the three states the header chip distinguishes, so every agenda
        // screenshot shows it carrying real numbers rather than a checkmark:
        // personal.md is committed but not pushed, planning.md has an edit that
        // was never committed, time-tracking.md is level with the remote.
        await initDemoRepository(wsDir);
        await fs.appendFile(
            personalFile,
            '\n## TODO Gym session\n' + `\`SCHEDULED: ${iso(0, { hour: 18, minute: 0 })}\`\n`,
            'utf-8'
        );
        await commitInDemoRepository(wsDir, ['personal.md'], 'notes: block out the evening session');
        // Deliberately left uncommitted. No timestamp, so the agenda views are
        // unchanged by it -- only the chip and its file list react.
        await fs.appendFile(planningFile, '\n## TODO Draft the retrospective agenda\n', 'utf-8');

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', wsDir, vscode.ConfigurationTarget.Workspace);

        await forceEnglishWeekdays();
        // applyDemoTheme now waits for VS Code's active-theme event, so
        // by the time control returns the editor has already recoloured.
        await applyDemoTheme();

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
        //
        // Views are switched by invoking the command, not by driving the
        // Command Palette: no keystroke reaches these frames, so the palette
        // would buy nothing and cost the one failure mode it has -- on a loaded
        // machine the typed query can miss the palette that just opened, and
        // the shot then shows an empty palette over the editor. The recorded
        // scenarios still go through the palette, where the keystrokes are the
        // point.
        await showAgenda('Day');
        await captureScreenshot('agenda-day');

        // 3. The git chip expanded: the counters in the header only say how
        //    many, the list says which files and offers the commit / push
        //    actions. The chip is the last control of the nav row, which is
        //    right-aligned, so its address is the row's baseline (fixed by the
        //    window chrome above it) and a short inset from the right edge --
        //    written that way so a change of capture width does not move the
        //    click off the button.
        const [screenWidth, screenHeight] = (process.env.MARKDOWN_ORG_SCREENSHOT_GEOMETRY ?? '1280x720')
            .split('x')
            .map((n) => parseInt(n, 10));
        const width = screenWidth ?? 1280;
        const height = screenHeight ?? 720;
        await clickAt(width - 40, 92);
        await sleep(900);
        await captureScreenshot('agenda-git');
        // Any click outside collapses the dropdown; the empty lower half of the
        // agenda body is the safest such point. The pointer is then parked on
        // the status bar: anywhere inside the page it would leave a row
        // highlighted or, in the month grid, raise the cell tooltip -- states
        // the later shots would carry for no reason.
        await clickAt(width / 2, 550);
        await moveMouseTo(width / 2, height - 4);
        await sleep(400);

        // 4. Agenda Week.
        await showAgenda('Week');
        await captureScreenshot('agenda-week');

        // 5. Agenda Month.
        await showAgenda('Month');
        await captureScreenshot('agenda-month');

        // 6. Tasks: everything open at once, grouped by priority instead of by
        //    day. The three views above are anchored on a date, so this is the
        //    only one that answers "what is on my plate" rather than "what is
        //    on this day".
        await showTasks();
        await captureScreenshot('agenda-tasks');

        // 7. Clocktable: the file already contains the rendered table, just
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
