import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('CLOCK Timestamp Editing Integration Tests', () => {
    let document: vscode.TextDocument;
    let editor: vscode.TextEditor;

    async function setupTest(content: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const testFilePath = path.join(workspaceFolder!.uri.fsPath, 'test-clock-edit.md');

        const uri = vscode.Uri.file(testFilePath);
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(uri, { overwrite: true });
        await vscode.workspace.applyEdit(edit);

        document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);

        const fullEdit = new vscode.WorkspaceEdit();
        fullEdit.insert(uri, new vscode.Position(0, 0), content);
        await vscode.workspace.applyEdit(fullEdit);

        editor = vscode.window.activeTextEditor!;
    }

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    suite('Square Brackets [] - Start Timestamp', () => {
        setup(async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 17:00]--[2025-12-09 Вт 20:30] =>  3:30\`\n`);
        });

        test('Year increment', async () => {
            editor.selection = new vscode.Selection(1, 10, 1, 10);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('[2026-12-09'));
        });

        test('Year decrement', async () => {
            editor.selection = new vscode.Selection(1, 10, 1, 10);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('[2024-12-09'));
        });

        test('Month increment', async () => {
            editor.selection = new vscode.Selection(1, 14, 1, 14);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('[2026-01-09'));
        });

        test('Month decrement', async () => {
            editor.selection = new vscode.Selection(1, 14, 1, 14);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-11-09'));
        });

        test('Day increment', async () => {
            editor.selection = new vscode.Selection(1, 17, 1, 17);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-10 Ср'));
        });

        test('Day decrement', async () => {
            editor.selection = new vscode.Selection(1, 17, 1, 17);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-08 Пн'));
        });

        test('Weekday increment', async () => {
            editor.selection = new vscode.Selection(1, 20, 1, 20);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-10 Ср'));
        });

        test('Weekday decrement', async () => {
            editor.selection = new vscode.Selection(1, 20, 1, 20);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-08 Пн'));
        });

        test('Hour increment', async () => {
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-09 Вт 18:00]'));
        });

        test('Hour decrement', async () => {
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-09 Вт 16:00]'));
        });

        test('Minute increment', async () => {
            editor.selection = new vscode.Selection(1, 26, 1, 26);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-09 Вт 17:01]'));
        });

        test('Minute decrement', async () => {
            editor.selection = new vscode.Selection(1, 26, 1, 26);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-09 Вт 16:59]'));
        });
    });

    suite('Square Brackets [] - End Timestamp', () => {
        setup(async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 17:00]--[2025-12-09 Вт 20:30] =>  3:30\`\n`);
        });

        test('Year increment', async () => {
            editor.selection = new vscode.Selection(1, 33, 1, 33);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2026-12-09'));
        });

        test('Year decrement', async () => {
            editor.selection = new vscode.Selection(1, 33, 1, 33);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--[2024-12-09'));
        });

        test('Month increment', async () => {
            editor.selection = new vscode.Selection(1, 37, 1, 37);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2026-01-09'));
        });

        test('Month decrement', async () => {
            editor.selection = new vscode.Selection(1, 37, 1, 37);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-11-09'));
        });

        test('Day increment', async () => {
            editor.selection = new vscode.Selection(1, 40, 1, 40);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-10 Ср'));
        });

        test('Day decrement', async () => {
            editor.selection = new vscode.Selection(1, 40, 1, 40);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-08 Пн'));
        });

        test('Weekday increment', async () => {
            editor.selection = new vscode.Selection(1, 43, 1, 43);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-10 Ср'));
        });

        test('Weekday decrement', async () => {
            editor.selection = new vscode.Selection(1, 43, 1, 43);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-08 Пн'));
        });

        test('Hour increment', async () => {
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-09 Вт 21:30]'));
        });

        test('Hour decrement', async () => {
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-09 Вт 19:30]'));
        });

        test('Minute increment', async () => {
            editor.selection = new vscode.Selection(1, 49, 1, 49);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-09 Вт 20:31]'));
        });

        test('Minute decrement', async () => {
            editor.selection = new vscode.Selection(1, 49, 1, 49);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-09 Вт 20:29]'));
        });
    });

    suite('Angle Brackets <> - Start Timestamp', () => {
        setup(async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 17:00>--<2025-12-09 Вт 20:30> =>  3:30\`\n`);
        });

        test('Year increment', async () => {
            editor.selection = new vscode.Selection(1, 10, 1, 10);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('<2026-12-09'));
        });

        test('Year decrement', async () => {
            editor.selection = new vscode.Selection(1, 10, 1, 10);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2024-12-09'));
        });

        test('Month increment', async () => {
            editor.selection = new vscode.Selection(1, 14, 1, 14);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('<2026-01-09'));
        });

        test('Month decrement', async () => {
            editor.selection = new vscode.Selection(1, 14, 1, 14);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-11-09'));
        });

        test('Day increment', async () => {
            editor.selection = new vscode.Selection(1, 17, 1, 17);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-10 Ср'));
        });

        test('Day decrement', async () => {
            editor.selection = new vscode.Selection(1, 17, 1, 17);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-08 Пн'));
        });

        test('Weekday increment', async () => {
            editor.selection = new vscode.Selection(1, 20, 1, 20);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-10 Ср'));
        });

        test('Weekday decrement', async () => {
            editor.selection = new vscode.Selection(1, 20, 1, 20);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-08 Пн'));
        });

        test('Hour increment', async () => {
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-09 Вт 18:00>'));
        });

        test('Hour decrement', async () => {
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-09 Вт 16:00>'));
        });

        test('Minute increment', async () => {
            editor.selection = new vscode.Selection(1, 26, 1, 26);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-09 Вт 17:01>'));
        });

        test('Minute decrement', async () => {
            editor.selection = new vscode.Selection(1, 26, 1, 26);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-09 Вт 16:59>'));
        });
    });

    suite('Angle Brackets <> - End Timestamp', () => {
        setup(async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 17:00>--<2025-12-09 Вт 20:30> =>  3:30\`\n`);
        });

        test('Year increment', async () => {
            editor.selection = new vscode.Selection(1, 33, 1, 33);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2026-12-09'));
        });

        test('Year decrement', async () => {
            editor.selection = new vscode.Selection(1, 33, 1, 33);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--<2024-12-09'));
        });

        test('Month increment', async () => {
            editor.selection = new vscode.Selection(1, 37, 1, 37);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2026-01-09'));
        });

        test('Month decrement', async () => {
            editor.selection = new vscode.Selection(1, 37, 1, 37);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-11-09'));
        });

        test('Day increment', async () => {
            editor.selection = new vscode.Selection(1, 40, 1, 40);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-10 Ср'));
        });

        test('Day decrement', async () => {
            editor.selection = new vscode.Selection(1, 40, 1, 40);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-08 Пн'));
        });

        test('Weekday increment', async () => {
            editor.selection = new vscode.Selection(1, 43, 1, 43);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-10 Ср'));
        });

        test('Weekday decrement', async () => {
            editor.selection = new vscode.Selection(1, 43, 1, 43);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-08 Пн'));
        });

        test('Hour increment', async () => {
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-09 Вт 21:30>'));
        });

        test('Hour decrement', async () => {
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-09 Вт 19:30>'));
        });

        test('Minute increment', async () => {
            editor.selection = new vscode.Selection(1, 49, 1, 49);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-09 Вт 20:31>'));
        });

        test('Minute decrement', async () => {
            editor.selection = new vscode.Selection(1, 49, 1, 49);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-09 Вт 20:29>'));
        });
    });

    suite('Duration Recalculation', () => {
        test('[] - Start hour increment recalculates duration', async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 17:00]--[2025-12-09 Вт 20:30] =>  3:30\`\n`);
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('=>  2:30'));
        });

        test('[] - End hour increment recalculates duration', async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 17:00]--[2025-12-09 Вт 20:30] =>  3:30\`\n`);
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('=>  4:30'));
        });

        test('<> - Start hour increment recalculates duration', async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 17:00>--<2025-12-09 Вт 20:30> =>  3:30\`\n`);
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('=>  2:30'));
        });

        test('<> - End hour increment recalculates duration', async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 17:00>--<2025-12-09 Вт 20:30> =>  3:30\`\n`);
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('=>  4:30'));
        });
    });

    suite('Multiple CLOCK Lines', () => {
        test('[] - Second line editing works', async () => {
            await setupTest(
                `# Test\n\`CLOCK: [2025-12-09 Вт 17:00]--[2025-12-09 Вт 20:30] =>  3:30\`\n\`CLOCK: [2025-12-09 Вт 21:00]--[2025-12-09 Вт 20:30] => -1:-30\`\n`
            );
            editor.selection = new vscode.Selection(2, 23, 2, 23);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(2).text.includes('[2025-12-09 Вт 20:00]'));
            assert.ok(editor.document.lineAt(2).text.includes('=>  0:30'));
        });

        test('<> - Second line editing works', async () => {
            await setupTest(
                `# Test\n\`CLOCK: <2025-12-09 Вт 17:00>--<2025-12-09 Вт 20:30> =>  3:30\`\n\`CLOCK: <2025-12-09 Вт 21:00>--<2025-12-09 Вт 20:30> => -1:-30\`\n`
            );
            editor.selection = new vscode.Selection(2, 46, 2, 46);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(2).text.includes('--<2025-12-09 Вт 21:30>'));
            assert.ok(editor.document.lineAt(2).text.includes('=>  0:30'));
        });
    });

    suite('Negative Duration Fix', () => {
        test('[] - Fix by decrementing start hour', async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 22:00]--[2025-12-09 Вт 21:30] => -1:-30\`\n`);
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('[2025-12-09 Вт 21:00]'));
            assert.ok(editor.document.lineAt(1).text.includes('=>  0:30'));
        });

        test('[] - Fix by incrementing end hour', async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 22:00]--[2025-12-09 Вт 21:30] => -1:-30\`\n`);
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-09 Вт 22:30]'));
            assert.ok(editor.document.lineAt(1).text.includes('=>  0:30'));
        });

        test('<> - Fix by decrementing start hour', async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 22:00>--<2025-12-09 Вт 21:30> => -1:-30\`\n`);
            editor.selection = new vscode.Selection(1, 23, 1, 23);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-09 Вт 21:00>'));
            assert.ok(editor.document.lineAt(1).text.includes('=>  0:30'));
        });

        test('<> - Fix by incrementing end hour', async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 22:00>--<2025-12-09 Вт 21:30> => -1:-30\`\n`);
            editor.selection = new vscode.Selection(1, 46, 1, 46);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-09 Вт 22:30>'));
            assert.ok(editor.document.lineAt(1).text.includes('=>  0:30'));
        });

        test('<> - Fix by incrementing end minute', async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 22:00>--<2025-12-09 Вт 21:30> => -1:-30\`\n`);
            editor.selection = new vscode.Selection(1, 49, 1, 49);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-09 Вт 21:31>'));
            assert.ok(editor.document.lineAt(1).text.includes('=> -1:-29'));
        });

        test('<> - Fix by decrementing start minute', async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-09 Вт 22:00>--<2025-12-09 Вт 21:30> => -1:-30\`\n`);
            editor.selection = new vscode.Selection(1, 26, 1, 26);
            await vscode.commands.executeCommand('markdown-org.timestampDown');
            assert.ok(editor.document.lineAt(1).text.includes('<2025-12-09 Вт 21:59>'));
            assert.ok(editor.document.lineAt(1).text.includes('=> -1:-29'));
        });
    });

    suite('Cursor boundary positions (left-leaning fallback)', () => {
        // Each timestamp part owns a half-open interval [start, end); when the
        // cursor lands on a separator (hyphen, space, colon, closing bracket)
        // the lookup retries with `character - 1`, resolving the position to
        // the part immediately to the left. See issue #41.

        test('[] - cursor on last hour digit -> hour increments', async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 21:00]--[2025-12-09 Вт 22:34] =>  1:34\`\n`);
            editor.selection = new vscode.Selection(1, 47, 1, 47); // last hour digit '2' in '22'
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-09 Вт 23:34]'));
        });

        test('[] - cursor on last minute digit -> minute increments', async () => {
            await setupTest(`# Test\n\`CLOCK: [2025-12-09 Вт 21:00]--[2025-12-09 Вт 22:34] =>  1:34\`\n`);
            editor.selection = new vscode.Selection(1, 50, 1, 50); // last minute digit '4' in '34'
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--[2025-12-09 Вт 22:35]'));
        });

        test('<> - cursor on last hour digit -> hour increments', async () => {
            await setupTest(`# Test\n\`CLOCK: <2025-12-10 Ср 22:00>--<2025-12-11 Чт 20:30> => 22:30\`\n`);
            editor.selection = new vscode.Selection(1, 47, 1, 47);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.ok(editor.document.lineAt(1).text.includes('--<2025-12-11 Чт 21:30>'));
        });

        test('cursor on the colon between end hour and end minute -> end hour increments', async () => {
            // Column 48 is `:` between `22` (end-hour) and `34` (end-minute).
            // The left-leaning fallback resolves to end-hour, so timestampUp
            // raises `22` -> `23` and the duration follows.
            const initial = `# Test\n\`CLOCK: [2025-12-09 Вт 21:00]--[2025-12-09 Вт 22:34] =>  1:34\`\n`;
            await setupTest(initial);
            editor.selection = new vscode.Selection(1, 48, 1, 48);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.strictEqual(
                editor.document.lineAt(1).text,
                '`CLOCK: [2025-12-09 Вт 21:00]--[2025-12-09 Вт 23:34] =>  2:34`'
            );
        });

        test('cursor on the closing bracket after end minute -> end minute increments', async () => {
            // Column 51 is `]` immediately past `34` (end-minute). Left-leaning
            // resolves it to end-minute, so timestampUp raises `34` -> `35`.
            const initial = `# Test\n\`CLOCK: [2025-12-09 Вт 21:00]--[2025-12-09 Вт 22:34] =>  1:34\`\n`;
            await setupTest(initial);
            editor.selection = new vscode.Selection(1, 51, 1, 51);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            assert.strictEqual(
                editor.document.lineAt(1).text,
                '`CLOCK: [2025-12-09 Вт 21:00]--[2025-12-09 Вт 22:35] =>  1:35`'
            );
        });
    });
});
