import * as vscode from 'vscode';
import { suite, test } from 'mocha';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
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

async function moveCursorIntoTimestampType(
    editor: vscode.TextEditor,
    line: number,
    typeName: 'CREATED' | 'SCHEDULED' | 'DEADLINE' | 'CLOSED'
): Promise<void> {
    const lineText = editor.document.lineAt(line).text;
    const typeStart = lineText.indexOf(typeName);
    if (typeStart < 0) {
        throw new Error(`expected ${typeName} on line ${line}, got: ${lineText}`);
    }
    await moveCursorTo(editor, line, typeStart + 2);
}

async function moveCursorIntoDayDigit(editor: vscode.TextEditor, line: number): Promise<void> {
    const lineText = editor.document.lineAt(line).text;
    const open = lineText.indexOf('<');
    if (open < 0) {
        throw new Error(`expected an active timestamp on line ${line}, got: ${lineText}`);
    }
    await moveCursorTo(editor, line, open + 9);
}

/**
 * All commands are dispatched via real keystrokes (`pressKey` -> xdotool) so
 * the screencast overlay surfaces every chord. The chord helper itself
 * sends each step as a separate `xdotool key` call with a JS-side sleep in
 * between -- VS Code's chord recognizer otherwise drops state on Xvfb.
 */
suite('Demo: Timestamps', () => {
    test('all four timestamp types + three repeater flavours', async function () {
        this.timeout(90000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }
        const demoFile = path.join(workspaceFolder.uri.fsPath, 'demo-timestamps.md');

        const initialContent =
            '# Project Timeline\n' +
            '\n' +
            '## TODO Prepare quarterly report\n' +
            '\n' +
            '## TODO Submit visa application\n' +
            '\n' +
            '## TODO Archive old reports\n' +
            '\n' +
            '## TODO Daily standup\n' +
            '`SCHEDULED: <2026-05-21 Thu 10:00 +1d>`\n' +
            '\n' +
            '## TODO Weekly review\n' +
            '`SCHEDULED: <2026-05-22 Fri 16:00 ++1w>`\n' +
            '\n' +
            '## TODO Monthly retrospective\n' +
            '`SCHEDULED: <2026-05-28 Thu 14:00 .+1m>`\n';
        await fs.writeFile(demoFile, initialContent, 'utf-8');

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
        await sleep(1000);
        await maximizeVscodeWindow();
        await sleep(500);
        await markDemoStart();
        await sleep(500);

        // Task 1: CREATED + SCHEDULED, then nudge the SCHEDULED date with
        // shift+Up/Down so the overlay highlights the key chord.
        const quarterlyLine = 2;
        await moveCursorTo(editor, quarterlyLine);
        await sleep(700);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('ctrl+k ctrl+k ctrl+c');
        await sleep(1100);
        await moveCursorTo(editor, quarterlyLine);
        await sleep(400);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('ctrl+k ctrl+k ctrl+s');
        await sleep(1200);

        // Find the SCHEDULED line (insertCreated and insertScheduled append
        // beneath the heading; their relative order depends on the existing
        // timestamp block ordering inside insertOrReplaceTimestamp).
        const scheduledLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l, idx) => idx > quarterlyLine && l.includes('SCHEDULED:'));
        await moveCursorIntoDayDigit(editor, scheduledLine);
        await sleep(500);
        await pressKey('shift+Down');
        await sleep(700);
        await pressKey('shift+Down');
        await sleep(700);
        await pressKey('shift+Up');
        await sleep(1100);

        // Task 2: DEADLINE
        const visaLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('Submit visa application'));
        await moveCursorTo(editor, visaLine);
        await sleep(700);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('ctrl+k ctrl+k d');
        await sleep(1300);

        // Task 3: SCHEDULED -> cycle the type with shift+Up so the overlay
        // shows the key while the timestamp type rotates.
        const archiveLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('Archive old reports'));
        await moveCursorTo(editor, archiveLine);
        await sleep(700);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('ctrl+k ctrl+k ctrl+s');
        await sleep(1300);

        const archiveScheduledLine = archiveLine + 1;
        await moveCursorIntoTimestampType(editor, archiveScheduledLine, 'SCHEDULED');
        await sleep(500);
        await pressKey('shift+Up');
        await sleep(900);
        await moveCursorIntoTimestampType(editor, archiveScheduledLine, 'DEADLINE');
        await sleep(400);
        await pressKey('shift+Up');
        await sleep(1300);

        // Repeater tour: bump the ++1w day -- repeater must survive.
        const weeklyLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('++1w'));
        await moveCursorIntoDayDigit(editor, weeklyLine);
        await sleep(500);
        await pressKey('shift+Up');
        await sleep(900);
        await pressKey('shift+Up');
        await sleep(1300);

        const monthlyLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('.+1m'));
        await moveCursorIntoDayDigit(editor, monthlyLine);
        await sleep(500);
        await pressKey('shift+Down');
        await sleep(900);
        await pressKey('shift+Down');
        await sleep(1800);
    });
});
