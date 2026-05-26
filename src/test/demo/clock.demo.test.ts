import * as vscode from 'vscode';
import { suite, test } from 'mocha';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { formatDurationHM, formatOrgTimestamp } from '../../utils';
import {
    sleep,
    markDemoStart,
    moveCursorTo,
    hideSidePanels,
    enableScreencast,
    forceEnglishWeekdays,
    applyMonokaiTheme,
    maximizeVscodeWindow,
    pressKey
} from './_helpers';

/**
 * Seed the demo file with realistic CLOCK history (different durations
 * across two days) before the recording starts.
 *
 * For the *live* CLOCK that the recording opens and closes via
 * `insertClockStart` / `insertClockFinish`, the test sets
 * `markdown-org.clockRoundMinutes = 60` so the elapsed wall-clock between
 * the two commands rounds to a stable 1:00 in the clocktable -- otherwise
 * the few real seconds between them collapse to 0:00 and the new task
 * silently drops out of the report.
 */
function clockEntry(start: Date, end: Date): string {
    // Force English weekday short names in seeded entries so the demo file is
    // already English before any settings update lands. The 'live' CLOCK that
    // `insertClockStart`/`insertClockFinish` add later picks up the workspace
    // setting installed by forceEnglishWeekdays().
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

suite('Demo: CLOCK', () => {
    test('clock history + new entry + clocktable', async function () {
        this.timeout(90000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }
        const demoFile = path.join(workspaceFolder.uri.fsPath, 'demo-clock.md');

        const today = new Date();
        const yesterday = addDays(today, -1);

        const seeded =
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
            '## TODO Wire up CI cache\n';

        await fs.writeFile(demoFile, seeded, 'utf-8');

        // Round CLOCK timestamps to the hour so insertClockStart/insertClockFinish
        // produce a stable 1:00 elapsed window regardless of the wall-clock
        // moment at which the demo is recorded.
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('clockRoundMinutes', 60, vscode.ConfigurationTarget.Workspace);

        const document = await vscode.workspace.openTextDocument(demoFile);
        const editor = await vscode.window.showTextDocument(document);

        await applyMonokaiTheme();
        await hideSidePanels();
        await forceEnglishWeekdays();
        await sleep(800);
        await maximizeVscodeWindow();
        await sleep(1500);
        await vscode.commands.executeCommand('notifications.clearAll');
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await enableScreencast();
        await sleep(1500);
        await maximizeVscodeWindow();
        await sleep(500);
        await markDemoStart();
        await sleep(600);

        // Move to the new task "Wire up CI cache" and open a CLOCK on it
        const wireUpLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('Wire up CI cache'));
        await moveCursorTo(editor, wireUpLine);
        await sleep(900);

        // insertClockStart is a 3-step chord: ctrl+k ctrl+c ctrl+s
        await pressKey('ctrl+k ctrl+c ctrl+s');
        await sleep(1400);

        // Close the just-opened CLOCK: cursor must be on the CLOCK line
        const openClockLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l, idx) => idx > wireUpLine && /CLOCK: \[/.test(l));
        await moveCursorTo(editor, openClockLine);
        await sleep(700);

        // insertClockFinish: ctrl+k ctrl+c ctrl+f
        await pressKey('ctrl+k ctrl+c ctrl+f');
        await sleep(1500);

        // Jump to the bottom of the document and insert the clock table
        await moveCursorTo(editor, editor.document.lineCount - 1);
        await editor.edit((eb) => {
            eb.insert(new vscode.Position(editor.document.lineCount, 0), '\n## Clock Report\n\n');
        });
        await moveCursorTo(editor, editor.document.lineCount - 1);
        await sleep(800);

        // insertClockTable: ctrl+k ctrl+c ctrl+v
        await pressKey('ctrl+k ctrl+c ctrl+v');
        await sleep(3000);
    });
});
