import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test } from 'mocha';

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

    test('Remove TODO preserves priority', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO [#A] Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-org.setTodo');

        assert.strictEqual(document.lineAt(0).text, '## [#A] Task title');
    });

    test('Remove DONE preserves priority', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## DONE [#A] Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-org.setDone');

        assert.strictEqual(document.lineAt(0).text, '## [#A] Task title');
    });

    async function openAtPriorityCookie(content: string): Promise<void> {
        document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        const cookieStart = content.indexOf('[#');
        // Cursor inside the cookie character (between `[#` and `]`).
        const inside = cookieStart + 2;
        editor.selection = new vscode.Selection(0, inside, 0, inside);
    }

    test('timestampUp on [#A] cycles to [#B]', async () => {
        await openAtPriorityCookie('## TODO [#A] Task title');
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#B] Task title');
    });

    test('timestampDown on [#A] stays at [#A] (lower bound)', async () => {
        await openAtPriorityCookie('## TODO [#A] Task title');
        await vscode.commands.executeCommand('markdown-org.timestampDown');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#A] Task title');
    });

    test('Set TODO preserves numeric priority [#3]', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## [#3] Numeric task',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('markdown-org.setTodo');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#3] Numeric task');
    });

    test('timestampUp on [#3] cycles to [#4]', async () => {
        await openAtPriorityCookie('## TODO [#3] Numeric task');
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#4] Numeric task');
    });

    test('timestampDown on [#3] cycles to [#2]', async () => {
        await openAtPriorityCookie('## TODO [#3] Numeric task');
        await vscode.commands.executeCommand('markdown-org.timestampDown');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#2] Numeric task');
    });

    test('timestampUp on [#9] cycles to [#10] (two-digit transition)', async () => {
        await openAtPriorityCookie('## TODO [#9] Numeric task');
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#10] Numeric task');
    });

    test('timestampDown on [#0] stays at [#0] (lower bound)', async () => {
        await openAtPriorityCookie('## TODO [#0] Numeric task');
        await vscode.commands.executeCommand('markdown-org.timestampDown');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#0] Numeric task');
    });

    test('timestampUp on [#64] stays at [#64] (upper bound)', async () => {
        await openAtPriorityCookie('## TODO [#64] Numeric task');
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(document.lineAt(0).text, '## TODO [#64] Numeric task');
    });
});
