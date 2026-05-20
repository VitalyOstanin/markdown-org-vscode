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

async function moveCursorIntoPriorityCookie(editor: vscode.TextEditor, line: number): Promise<void> {
    const lineText = editor.document.lineAt(line).text;
    const cookieStart = lineText.indexOf('[#');
    if (cookieStart < 0) {
        throw new Error(`expected a priority cookie on line ${line}, got: ${lineText}`);
    }
    await moveCursorTo(editor, line, cookieStart + 2);
}

suite('Demo: Task Status', () => {
    test('TODO -> priority (letter + numeric) -> DONE workflow', async function () {
        this.timeout(90000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }
        const demoFile = path.join(workspaceFolder.uri.fsPath, 'demo.md');
        const initialContent =
            '# Demo Tasks\n' +
            '\n' +
            '## Buy groceries\n' +
            '\n' +
            '## Prepare release notes\n' +
            '\n' +
            '## Reply to mentor email\n';
        await fs.writeFile(demoFile, initialContent, 'utf-8');

        const document = await vscode.workspace.openTextDocument(demoFile);
        const editor = await vscode.window.showTextDocument(document);

        // Order matters: apply the theme first (awaits the active-theme
        // event), then collapse side panels and adjust workspace settings.
        // maximizeVscodeWindow comes last so neither the theme repaint nor
        // closing a sidebar can reset the X11 window size mid-setup.
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
        // Final defensive resize -- screencast overlay activation can shift
        // the layout. This happens BEFORE markDemoStart so the transition is
        // trimmed out of the recording.
        await maximizeVscodeWindow();
        await sleep(500);
        await markDemoStart();
        await sleep(500);

        // Task 1: TODO -> [#A] -> [#B] (timestampUp on the cookie) -> DONE
        const buyLine = 2;
        await moveCursorTo(editor, buyLine);
        await sleep(700);
        await pressKey('ctrl+k ctrl+t');
        await sleep(900);
        await pressKey('ctrl+k ctrl+p');
        await sleep(900);
        await moveCursorIntoPriorityCookie(editor, buyLine);
        await sleep(500);
        await pressKey('shift+Up');
        await sleep(1000);
        await pressKey('ctrl+k ctrl+d');
        await sleep(1300);

        // Task 2: TODO -> [#A] -> rewrite cookie to [#3] -> timestampUp -> [#4]
        const releaseLine = 4;
        await moveCursorTo(editor, releaseLine);
        await sleep(700);
        await pressKey('ctrl+k ctrl+t');
        await sleep(900);
        await pressKey('ctrl+k ctrl+p');
        await sleep(900);

        const releaseText = editor.document.lineAt(releaseLine).text;
        const cookieStart = releaseText.indexOf('[#A]');
        await editor.edit((eb) => {
            eb.replace(new vscode.Range(releaseLine, cookieStart, releaseLine, cookieStart + 4), '[#3]');
        });
        await sleep(900);
        await moveCursorIntoPriorityCookie(editor, releaseLine);
        await sleep(500);
        await pressKey('shift+Up');
        await sleep(1500);

        // Task 3: plain TODO, no priority
        await moveCursorTo(editor, 6);
        await sleep(700);
        await pressKey('ctrl+k ctrl+t');
        await sleep(1500);
    });
});
