import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('CLOCK Integration Tests', () => {
    let testFilePath: string;
    let testDocument: vscode.TextDocument;
    let editor: vscode.TextEditor;

    setup(async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        testFilePath = path.join(workspaceFolder.uri.fsPath, 'test-clock.md');
        
        const initialContent = `## TODO Test task
\`CREATED: <2025-12-09 Пн 10:00>\`

## TODO Another task
\`SCHEDULED: <2025-12-10 Вт 14:00>\`
`;
        
        fs.writeFileSync(testFilePath, initialContent, 'utf8');
        
        testDocument = await vscode.workspace.openTextDocument(testFilePath);
        editor = await vscode.window.showTextDocument(testDocument);
    });

    teardown(async () => {
        if (testDocument) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    test('Insert CLOCK start without rounding', async () => {
        await vscode.workspace.getConfiguration('markdown-org').update('clockRoundMinutes', undefined, true);
        
        const position = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(position, position);
        
        await vscode.commands.executeCommand('markdown-org.insertClockStart');
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        assert.strictEqual(lines[0], '## TODO Test task');
        assert.strictEqual(lines[1], '`CREATED: <2025-12-09 Пн 10:00>`');
        assert.match(lines[2], /^`CLOCK: \[\d{4}-\d{2}-\d{2} [^\]]+\]`$/);
    });

    test('Insert CLOCK start with 30 minute rounding', async () => {
        await vscode.workspace.getConfiguration('markdown-org').update('clockRoundMinutes', 30, true);
        
        const position = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(position, position);
        
        await vscode.commands.executeCommand('markdown-org.insertClockStart');
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        const clockLine = lines[2];
        const match = clockLine.match(/`CLOCK: \[\d{4}-\d{2}-\d{2} [^\s]+ (\d{2}):(\d{2})\]`$/);
        assert.ok(match, 'CLOCK line should match expected format');
        
        const minutes = parseInt(match![2]);
        assert.ok(minutes === 0 || minutes === 30, `Minutes should be 0 or 30, got ${minutes}`);
    });

    test('Insert CLOCK finish closes open CLOCK', async () => {
        await vscode.workspace.getConfiguration('markdown-org').update('clockRoundMinutes', undefined, true);
        
        const position = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(position, position);
        
        await vscode.commands.executeCommand('markdown-org.insertClockStart');
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await vscode.commands.executeCommand('markdown-org.insertClockFinish');
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        const clockLine = lines[2];
        assert.match(clockLine, /^`CLOCK: \[\d{4}-\d{2}-\d{2} [^\]]+\]--\[\d{4}-\d{2}-\d{2} [^\]]+\] => +\d+:\d{2}`$/);
    });

    test('Insert CLOCK finish with rounding avoids zero duration', async () => {
        await vscode.workspace.getConfiguration('markdown-org').update('clockRoundMinutes', 30, true);
        
        const content = `## TODO Test task
\`CREATED: <2025-12-09 Пн 10:00>\`
\`CLOCK: [2025-12-09 Пн 10:30]\`
`;
        
        await editor.edit(editBuilder => {
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            editBuilder.replace(fullRange, content);
        });
        
        const position = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(position, position);
        
        await vscode.commands.executeCommand('markdown-org.insertClockFinish');
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        const clockLine = lines[2];
        const match = clockLine.match(/=> +(\d+):(\d{2})`$/);
        assert.ok(match, 'Should have duration');
        
        const hours = parseInt(match![1]);
        const minutes = parseInt(match![2]);
        const totalMinutes = hours * 60 + minutes;
        
        assert.ok(totalMinutes > 0, 'Duration should be greater than zero');
    });

    test('Cannot insert CLOCK start when open CLOCK exists', async () => {
        const content = `## TODO Test task
\`CREATED: <2025-12-09 Пн 10:00>\`
\`CLOCK: [2025-12-09 Пн 10:30]\`
`;
        
        await editor.edit(editBuilder => {
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            editBuilder.replace(fullRange, content);
        });
        
        const position = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(position, position);
        
        const initialText = editor.document.getText();
        
        await vscode.commands.executeCommand('markdown-org.insertClockStart');
        
        const finalText = editor.document.getText();
        assert.strictEqual(initialText, finalText, 'Text should not change when open CLOCK exists');
    });

    test('CLOCK entries are sorted by time', async () => {
        await vscode.workspace.getConfiguration('markdown-org').update('clockRoundMinutes', undefined, true);
        
        const content = `## TODO Test task
\`CREATED: <2025-12-09 Пн 10:00>\`
\`CLOCK: [2025-12-09 Пн 14:00]--[2025-12-09 Пн 15:00] =>  1:00\`
`;
        
        await editor.edit(editBuilder => {
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            editBuilder.replace(fullRange, content);
        });
        
        const position = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(position, position);
        
        await vscode.commands.executeCommand('markdown-org.insertClockStart');
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        assert.match(lines[2], /`CLOCK: \[2025-12-09 [^\]]+\]--\[2025-12-09 [^\]]+\] => +1:00`/);
        assert.match(lines[3], /^`CLOCK: \[\d{4}-\d{2}-\d{2} [^\]]+\]`$/);
    });

    test('CLOCK entries placed after timestamps', async () => {
        await vscode.workspace.getConfiguration('markdown-org').update('clockRoundMinutes', undefined, true);
        
        const position = new vscode.Position(3, 0);
        editor.selection = new vscode.Selection(position, position);
        
        await vscode.commands.executeCommand('markdown-org.insertClockStart');
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        assert.strictEqual(lines[3], '## TODO Another task');
        assert.strictEqual(lines[4], '`SCHEDULED: <2025-12-10 Вт 14:00>`');
        assert.match(lines[5], /^`CLOCK: \[\d{4}-\d{2}-\d{2} [^\]]+\]`$/);
    });

    test('Multiple CLOCK entries can exist', async () => {
        await vscode.workspace.getConfiguration('markdown-org').update('clockRoundMinutes', undefined, true);
        
        const content = `## TODO Test task
\`CREATED: <2025-12-09 Пн 10:00>\`
\`CLOCK: [2025-12-09 Пн 10:00]--[2025-12-09 Пн 11:00] =>  1:00\`
\`CLOCK: [2025-12-09 Пн 12:00]--[2025-12-09 Пн 13:00] =>  1:00\`
`;
        
        await editor.edit(editBuilder => {
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            editBuilder.replace(fullRange, content);
        });
        
        const position = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(position, position);
        
        await vscode.commands.executeCommand('markdown-org.insertClockStart');
        
        const text = editor.document.getText();
        const lines = text.split('\n');
        
        const clockLines = lines.filter(line => line.match(/^`CLOCK:/));
        assert.strictEqual(clockLines.length, 3, 'Should have 3 CLOCK entries');
    });
});
