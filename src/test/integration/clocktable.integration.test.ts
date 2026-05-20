import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * These tests exercise insertClockTable end-to-end. Each test opens a fresh
 * untitled markdown document with the desired content so VS Code never has
 * to reconcile a re-written file on disk against an already-open
 * TextDocument cache.
 */
suite('CLOCK Table Integration Tests', () => {
    let editor: vscode.TextEditor;

    async function openWith(content: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
        editor = await vscode.window.showTextDocument(document);
        const lastLine = editor.document.lineCount - 1;
        const lastChar = editor.document.lineAt(lastLine).text.length;
        const end = new vscode.Position(lastLine, lastChar);
        editor.selection = new vscode.Selection(end, end);
    }

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Insert clock table with multiple TODO tasks (regression)', async function () {
        this.timeout(5000);

        await openWith(
            '## TODO Task 1\n' +
                '`CLOCK: <2025-12-09 Mon 10:00>--<2025-12-09 Mon 12:30> => 2:30`\n' +
                '\n' +
                '## TODO Task 2\n' +
                '`CLOCK: <2025-12-09 Mon 14:00>--<2025-12-09 Mon 15:45> => 1:45`\n'
        );

        await vscode.commands.executeCommand('markdown-org.insertClockTable');

        const text = editor.document.getText();
        assert.ok(text.includes('| Heading'), 'Should contain table header');
        assert.ok(text.includes('| Time'), 'Should contain Time column');
        assert.ok(text.includes('| Task 1'), 'Should contain Task 1');
        assert.ok(text.includes('| Task 2'), 'Should contain Task 2');
        assert.ok(text.includes('| 2:30'), 'Should contain Task 1 time');
        assert.ok(text.includes('| 1:45'), 'Should contain Task 2 time');
        assert.ok(text.includes('**Total**'), 'Should contain total row');
        assert.ok(text.includes('**4:15**'), 'Should contain total time 4:15');
    });

    test('Insert clock table with no CLOCK entries renders the empty placeholder', async function () {
        this.timeout(5000);

        await openWith('## TODO Task without clocks\nSome content here\n');

        await vscode.commands.executeCommand('markdown-org.insertClockTable');

        const text = editor.document.getText();
        assert.ok(
            text.includes('No CLOCK entries') || text.includes('0:00'),
            'Should show no entries message or zero time'
        );
    });

    test('DONE heading with CLOCK history is included in the table', async function () {
        this.timeout(5000);

        await openWith(
            '## TODO Active\n' +
                '`CLOCK: [2025-12-09 Mon 10:00]--[2025-12-09 Mon 11:00] => 1:00`\n' +
                '\n' +
                '## DONE Finished work\n' +
                '`CLOCK: [2025-12-09 Mon 14:00]--[2025-12-09 Mon 15:45] => 1:45`\n'
        );

        await vscode.commands.executeCommand('markdown-org.insertClockTable');

        const text = editor.document.getText();
        assert.ok(text.includes('| Active'), 'Should contain TODO row');
        assert.ok(text.includes('| Finished work'), 'DONE heading must appear in the clock table');
        assert.ok(text.includes('| 1:00'), 'Should contain TODO duration');
        assert.ok(text.includes('| 1:45'), 'Should contain DONE duration');
        assert.ok(text.includes('**2:45**'), 'Total should sum across TODO + DONE');
    });

    test('Plain heading (no TODO/DONE keyword) with CLOCK is included', async function () {
        this.timeout(5000);

        await openWith('## Plain heading\n' + '`CLOCK: [2025-12-09 Mon 10:00]--[2025-12-09 Mon 10:30] => 0:30`\n');

        await vscode.commands.executeCommand('markdown-org.insertClockTable');

        const text = editor.document.getText();
        assert.ok(text.includes('| Plain heading'), 'Plain heading should appear in the clock table');
        assert.ok(text.includes('| 0:30'), 'Should contain the duration');
        assert.ok(text.includes('**0:30**'), 'Total should equal the only entry');
    });
});
