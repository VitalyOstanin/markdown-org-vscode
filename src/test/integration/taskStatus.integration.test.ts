import * as vscode from 'vscode';
import * as assert from 'node:assert';
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

    test('Set CANCELLED command adds CANCELLED to heading', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-org.setCancelled');

        assert.strictEqual(document.lineAt(0).text, '## CANCELLED Task title');
    });

    test('Set CANCELLED command transitions TODO -> CANCELLED', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '### TODO Foo',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.setCancelled');

        assert.strictEqual(document.lineAt(0).text, '### CANCELLED Foo');
    });

    test('Set CANCELLED on CANCELLED heading toggles it off', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '### CANCELLED Foo',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-org.setCancelled');

        assert.strictEqual(document.lineAt(0).text, '### Foo');
    });

    test('Set CANCELLED on CANCELED (single-L) heading toggles it off across spelling', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '### CANCELED Foo',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-org.setCancelled');

        assert.strictEqual(document.lineAt(0).text, '### Foo');
    });

    test('Set CANCELLED on TODO heading writes CANCELLED (two-L canonical form)', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '### TODO Foo',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-org.setCancelled');

        assert.strictEqual(document.lineAt(0).text, '### CANCELLED Foo');
    });

    test('Set CANCELLED preserves priority', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## [#A] Task title',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('markdown-org.setCancelled');

        assert.strictEqual(document.lineAt(0).text, '## CANCELLED [#A] Task title');
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

    // Completing a repeating task moves it instead of closing it (ADR-0017),
    // which is what the phone does as well. Dates are built relative to today
    // so the expectation does not go stale.
    suite('repeating tasks', () => {
        test('DONE on a repeating task moves the date and leaves it open', async () => {
            const yesterday = shiftDays(new Date(), -1);
            document = await vscode.workspace.openTextDocument({
                content: `## TODO Water the plants\n\`SCHEDULED: ${stamp(yesterday, '+1d')}\`\n`,
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);

            await vscode.commands.executeCommand('markdown-org.setDone');

            assert.strictEqual(document.lineAt(0).text, '## TODO Water the plants');
            assert.strictEqual(document.lineAt(1).text, `\`SCHEDULED: ${stamp(new Date(), '+1d')}\``);
        });

        test('a heading with no keyword gains none, and the date still moves', async () => {
            const yesterday = shiftDays(new Date(), -1);
            document = await vscode.workspace.openTextDocument({
                content: `## Water the plants\n\`SCHEDULED: ${stamp(yesterday, '+1d')}\`\n`,
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);

            await vscode.commands.executeCommand('markdown-org.setDone');

            assert.strictEqual(document.lineAt(0).text, '## Water the plants');
            assert.strictEqual(document.lineAt(1).text, `\`SCHEDULED: ${stamp(new Date(), '+1d')}\``);
        });

        test('clearing DONE moves nothing', async () => {
            const yesterday = shiftDays(new Date(), -1);
            const scheduled = `\`SCHEDULED: ${stamp(yesterday, '+1d')}\``;
            document = await vscode.workspace.openTextDocument({
                content: `## DONE Water the plants\n${scheduled}\n`,
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);

            await vscode.commands.executeCommand('markdown-org.setDone');

            assert.strictEqual(document.lineAt(0).text, '## Water the plants');
            assert.strictEqual(document.lineAt(1).text, scheduled);
        });

        test('a task without a repeater is closed as before', async () => {
            const scheduled = `\`SCHEDULED: ${stamp(new Date())}\``;
            document = await vscode.workspace.openTextDocument({
                content: `## TODO Pay the bill\n${scheduled}\n`,
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);

            await vscode.commands.executeCommand('markdown-org.setDone');

            assert.strictEqual(document.lineAt(0).text, '## DONE Pay the bill');
            assert.strictEqual(document.lineAt(1).text, scheduled);
        });
    });

    // The picker is host UI, so the tests drive it by answering its two
    // prompts: the quick pick, and the input box behind "Other value…".
    suite('Set Priority', () => {
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInputBox = vscode.window.showInputBox;

        interface PickItem {
            label: string;
            detail?: string;
        }

        /**
         * Answer the quick pick with the item `choose` selects, or dismiss it
         * when `choose` finds none.
         *
         * Items are selected by shape rather than by caption: the picker
         * speaks the language `markdown-org.uiLanguage` resolved to, so
         * matching the English wording would tie these tests to the editor's
         * locale. Values (`A`, `12`) are not translated and are matched
         * directly.
         */
        function answerQuickPick(choose: (items: PickItem[]) => PickItem | undefined): void {
            (vscode.window as { showQuickPick: unknown }).showQuickPick = (items: unknown) =>
                Promise.resolve(choose(items as PickItem[]));
        }

        /** The value entries: everything before "Other value…" and "No priority". */
        const value = (label: string) => (items: PickItem[]) => items.find((item) => item.label === label);
        /** The only entry carrying a detail line is the free-input one. */
        const other = (items: PickItem[]) => items.find((item) => item.detail !== undefined);
        /** The clearing entry is last. */
        const none = (items: PickItem[]) => items.at(-1);
        const dismiss = () => undefined;

        function answerInputBox(value: string | undefined): void {
            (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(value);
        }

        teardown(() => {
            (vscode.window as { showQuickPick: unknown }).showQuickPick = originalQuickPick;
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInputBox;
        });

        test('a letter picked from the list lands on the heading', async () => {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO Task title',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            answerQuickPick(value('B'));

            await vscode.commands.executeCommand('markdown-org.setPriority');

            assert.strictEqual(document.lineAt(0).text, '## TODO [#B] Task title');
        });

        test('a number typed behind "Other value…" lands on the heading', async () => {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO Task title',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            answerQuickPick(other);
            answerInputBox('12');

            await vscode.commands.executeCommand('markdown-org.setPriority');

            assert.strictEqual(document.lineAt(0).text, '## TODO [#12] Task title');
        });

        test('a value out of range is refused and the heading is left alone', async () => {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO [#A] Task title',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            answerQuickPick(other);
            // The real input box would not return this (its validator blocks
            // the value); the stub does, and the command has to refuse it too.
            answerInputBox('65');

            await vscode.commands.executeCommand('markdown-org.setPriority');

            assert.strictEqual(document.lineAt(0).text, '## TODO [#A] Task title');
        });

        test('"No priority" clears the cookie', async () => {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO [#12] Task title',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            answerQuickPick(none);

            await vscode.commands.executeCommand('markdown-org.setPriority');

            assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
        });

        test('dismissing the picker leaves the heading alone', async () => {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO [#A] Task title',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            answerQuickPick(dismiss);

            await vscode.commands.executeCommand('markdown-org.setPriority');

            assert.strictEqual(document.lineAt(0).text, '## TODO [#A] Task title');
        });

        test('a value the heading already carries is offered by the picker', async () => {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO [#12] Task title',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            // `12` is not among the offered letters, so the picker has to list
            // it separately -- otherwise it shows a value the heading contradicts.
            answerQuickPick(value('12'));

            await vscode.commands.executeCommand('markdown-org.setPriority');

            assert.strictEqual(document.lineAt(0).text, '## TODO [#12] Task title');
        });

        test('the picked value replaces a cookie written inside the title', async () => {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO Buy [#A] filter',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            answerQuickPick(value('C'));

            await vscode.commands.executeCommand('markdown-org.setPriority');

            assert.strictEqual(document.lineAt(0).text, '## TODO [#C] Buy filter');
        });
    });
});

/**
 * `<YYYY-MM-DD>` or `<YYYY-MM-DD +1d>`: the date-only active form the tests
 * above compare against, with the repeater inside the brackets where org puts
 * it.
 */
function stamp(date: Date, repeater?: string): string {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const tail = repeater ? ` ${repeater}` : '';
    return `<${date.getFullYear()}-${month}-${day}${tail}>`;
}

/** `days` from `date`, as a new `Date`. */
function shiftDays(date: Date, days: number): Date {
    const moved = new Date(date.getTime());
    moved.setDate(moved.getDate() + days);
    return moved;
}
