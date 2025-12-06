import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, before, test } from 'mocha';

suite('Timestamp Integration Tests', () => {
    let document: vscode.TextDocument;
    let editor: vscode.TextEditor;

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Insert CREATED timestamp', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        
        await vscode.commands.executeCommand('markdown-org.insertCreated');
        
        const line1 = document.lineAt(1).text;
        assert.ok(line1.startsWith('`CREATED: <'));
        assert.ok(line1.endsWith('>`'));
    });

    test('Insert SCHEDULED timestamp', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        
        await vscode.commands.executeCommand('markdown-org.insertScheduled');
        
        const line1 = document.lineAt(1).text;
        assert.ok(line1.startsWith('`SCHEDULED: <'));
        assert.ok(line1.endsWith('>`'));
    });

    test('Insert DEADLINE timestamp', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        
        await vscode.commands.executeCommand('markdown-org.insertDeadline');
        
        const line1 = document.lineAt(1).text;
        assert.ok(line1.startsWith('`DEADLINE: <'));
        assert.ok(line1.endsWith('>`'));
    });

    test('Toggle SCHEDULED removes it', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n`SCHEDULED: <2025-12-06 Fri>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        
        await vscode.commands.executeCommand('markdown-org.insertScheduled');
        
        assert.strictEqual(document.lineCount, 2);
        assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
    });

    test('SCHEDULED replaces DEADLINE', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n`DEADLINE: <2025-12-06 Fri>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        
        await vscode.commands.executeCommand('markdown-org.insertScheduled');
        
        const line1 = document.lineAt(1).text;
        assert.ok(line1.startsWith('`SCHEDULED: <'));
    });

    test('DEADLINE replaces SCHEDULED', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n`SCHEDULED: <2025-12-06 Fri>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        
        await vscode.commands.executeCommand('markdown-org.insertDeadline');
        
        const line1 = document.lineAt(1).text;
        assert.ok(line1.startsWith('`DEADLINE: <'));
    });

    test('Timestamp Up increments day', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`SCHEDULED: <2025-12-06 Fri>`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 22, 0, 22);
        
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        
        const line = document.lineAt(0).text;
        assert.ok(line.includes('2025-12-07'));
    });

    test('Timestamp Down decrements day', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`SCHEDULED: <2025-12-06 Fri>`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 22, 0, 22);
        
        await vscode.commands.executeCommand('markdown-org.timestampDown');
        
        const line = document.lineAt(0).text;
        assert.ok(line.includes('2025-12-05'));
    });

    test('Timestamp Up on type cycles SCHEDULED to DEADLINE', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`SCHEDULED: <2025-12-06 Fri>`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 5, 0, 5); // cursor on SCHEDULED
        
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        
        const line = document.lineAt(0).text;
        assert.ok(line.startsWith('`DEADLINE:'));
    });
});
