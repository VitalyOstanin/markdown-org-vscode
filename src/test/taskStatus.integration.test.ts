import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, before, test } from 'mocha';

suite('Task Status Integration Tests', () => {
    let document: vscode.TextDocument;
    let editor: vscode.TextEditor;

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Set TODO command adds TODO to heading', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.setTodo');
        
        assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
    });

    test('Set DONE command adds DONE to heading', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.setDone');
        
        assert.strictEqual(document.lineAt(0).text, '## DONE Task title');
    });

    test('Set TODO preserves priority', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## [#A] Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.setTodo');
        
        assert.strictEqual(document.lineAt(0).text, '## TODO [#A] Task title');
    });

    test('Set DONE on TODO changes status', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.setDone');
        
        assert.strictEqual(document.lineAt(0).text, '## DONE Task title');
    });

    test('Toggle priority adds [#A]', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.togglePriority');
        
        assert.strictEqual(document.lineAt(0).text, '## TODO [#A] Task title');
    });

    test('Toggle priority removes [#A]', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO [#A] Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.togglePriority');
        
        assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
    });

    test('Set TODO works on heading with cursor', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## Task title\n\nSome content',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 5, 0, 5);
        
        await vscode.commands.executeCommand('markdown-org.setTodo');
        
        assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
    });

    test('Set TODO works from content line below heading', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## Task title\n\nSome content',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(2, 0, 2, 0);
        
        await vscode.commands.executeCommand('markdown-org.setTodo');
        
        assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
    });

    test('Remove TODO also removes priority', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO [#A] Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.setTodo');
        
        assert.strictEqual(document.lineAt(0).text, '## Task title');
    });

    test('Remove DONE also removes priority', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## DONE [#A] Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        
        await vscode.commands.executeCommand('markdown-org.setDone');
        
        assert.strictEqual(document.lineAt(0).text, '## Task title');
    });
});
