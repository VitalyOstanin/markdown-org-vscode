import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { suite, test } from 'mocha';
import {
    sleep,
    markDemoStart,
    moveCursorTo,
    hideSidePanels,
    enableScreencast,
    forceEnglishWeekdays,
    applyDemoTheme,
    maximizeVscodeWindow,
    pressKey,
    runCommandViaPalette
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
 * Commands are dispatched at the X-server level so the screencast overlay
 * surfaces the input. Which of the two ways is used follows one rule: the
 * first time a command appears in a step it goes through the Command Palette,
 * which spells its name out; an immediate repetition of that same command --
 * Timestamp Up applied twice to walk a date -- is sent as the chord the
 * palette just demonstrated, so the step shows both the name and the binding
 * without repeating a four-second palette dance for every increment.
 */
suite('Demo: Timestamps', () => {
    test('all four timestamp types + three repeater flavours', async function () {
        // Nine palette invocations at about four seconds each sit on top of
        // what the chord-driven version took.
        this.timeout(240000);

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
            '`SCHEDULED: <2026-05-28 Thu 14:00 .+1m>`\n' +
            '\n' +
            '## English class\n';
        await fs.writeFile(demoFile, initialContent, 'utf-8');

        const document = await vscode.workspace.openTextDocument(demoFile);
        const editor = await vscode.window.showTextDocument(document);

        await applyDemoTheme();
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
        // Timestamp Down / Up.
        const quarterlyLine = 2;
        await moveCursorTo(editor, quarterlyLine);
        await sleep(700);
        await runCommandViaPalette('Markdown Org Insert CREATED Timestamp');
        await sleep(1100);
        await moveCursorTo(editor, quarterlyLine);
        await sleep(400);
        await runCommandViaPalette('Markdown Org Insert SCHEDULED Timestamp');
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
        await runCommandViaPalette('Markdown Org Timestamp Down');
        await sleep(700);
        // Same command again -- the chord the palette just showed.
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('shift+Down');
        await sleep(700);
        await runCommandViaPalette('Markdown Org Timestamp Up');
        await sleep(1100);

        // Task 2: DEADLINE
        const visaLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('Submit visa application'));
        await moveCursorTo(editor, visaLine);
        await sleep(700);
        await runCommandViaPalette('Markdown Org Insert DEADLINE Timestamp');
        await sleep(1300);

        // Task 3: SCHEDULED -> cycle the type, the cursor sitting on the
        // keyword rather than on a date part.
        const archiveLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('Archive old reports'));
        await moveCursorTo(editor, archiveLine);
        await sleep(700);
        await runCommandViaPalette('Markdown Org Insert SCHEDULED Timestamp');
        await sleep(1300);

        const archiveScheduledLine = archiveLine + 1;
        await moveCursorIntoTimestampType(editor, archiveScheduledLine, 'SCHEDULED');
        await sleep(500);
        await runCommandViaPalette('Markdown Org Timestamp Up');
        await sleep(900);
        await moveCursorIntoTimestampType(editor, archiveScheduledLine, 'DEADLINE');
        await sleep(400);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('shift+Up');
        await sleep(1300);

        // Repeater tour: bump the ++1w day -- repeater must survive.
        const weeklyLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('++1w'));
        await moveCursorIntoDayDigit(editor, weeklyLine);
        await sleep(500);
        await runCommandViaPalette('Markdown Org Timestamp Up');
        await sleep(900);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('shift+Up');
        await sleep(1300);

        const monthlyLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('.+1m'));
        await moveCursorIntoDayDigit(editor, monthlyLine);
        await sleep(500);
        await runCommandViaPalette('Markdown Org Timestamp Down');
        await sleep(900);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await pressKey('shift+Down');
        await sleep(1300);

        // The appointment: a timestamp with no keyword at all. It is the date
        // something happens rather than a date owed, which is what the two
        // planning keywords above say instead.
        const classLine = editor.document
            .getText()
            .split('\n')
            .findIndex((l) => l.includes('English class'));
        await moveCursorTo(editor, classLine);
        await sleep(700);
        await runCommandViaPalette('Markdown Org Insert Timestamp (no keyword)');
        // Longer than the other holds: this is the last step, and the line it
        // writes is what the step is about -- a shorter pause ends the
        // recording while the screencast overlay still covers it.
        await sleep(3500);
    });
});
