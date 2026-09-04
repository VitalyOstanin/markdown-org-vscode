import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { suite, after, afterEach, test } from 'mocha';

/**
 * The two exceptions a repeating entry can carry, written from the editor.
 *
 * The shape landing in the file is unit-tested against the Android client's
 * own tests (occurrenceEdit.test.ts); what is checked here is the crossing --
 * the boxes the command asks, the entry it acts on, and that the write reaches
 * the open document rather than only the array of lines.
 */
suite('One occurrence of a series', () => {
    const originalInputBox = vscode.window.showInputBox;
    let document: vscode.TextDocument | undefined;

    afterEach(async () => {
        (vscode.window as { showInputBox: unknown }).showInputBox = originalInputBox;
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        document = undefined;
    });

    /** Answer the boxes in order; `undefined` is Escape, and a missing answer is one too. */
    function answer(...values: (string | undefined)[]): void {
        const queue = [...values];
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(queue.shift());
    }

    /** What the boxes were offered, so a test can check the day it opens on. */
    function record(values: (string | undefined)[]): string[] {
        const seen: string[] = [];
        const queue = [...values];
        (vscode.window as { showInputBox: unknown }).showInputBox = (options?: { value?: string }) => {
            seen.push(options?.value ?? '');
            return Promise.resolve(queue.shift());
        };
        return seen;
    }

    async function open(content: string, cursorLine = 0): Promise<vscode.TextDocument> {
        document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(document, {
            selection: new vscode.Range(cursorLine, 0, cursorLine, 0)
        });
        return document;
    }

    /** A weekly class, which is the case these operations exist for. */
    const SERIES = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''].join('\n');

    test('a cancelled occurrence joins the series EXDATE', async () => {
        const doc = await open(SERIES);

        answer('2026-08-20');
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence');

        assert.strictEqual(
            doc.getText(),
            [
                '# TODO English',
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
                '```org-properties',
                'EXDATE: 2026-08-20',
                '```',
                ''
            ].join('\n')
        );
    });

    test('a moved occurrence is an entry of its own at the end of the file', async () => {
        const doc = await open(SERIES);

        answer('2026-08-20', '2026-08-22', '18:00');
        await vscode.commands.executeCommand('markdown-org.moveOccurrence');

        const text = doc.getText();
        assert.match(text, /SCHEDULED: <2026-08-06 Thu 15:00 \+1w>/, 'the series goes on repeating');
        assert.match(text, /\nID: [0-9a-f-]{36}\n/, 'the series is named so the replacement can point at it');
        assert.match(text, /\n# TODO English\n`SCHEDULED: <2026-08-22 Sat 18:00>`\n/);
        assert.match(text, /\nRECURRENCE_ID: 2026-08-20 15:00\n/);
        assert.ok(!text.includes('EXDATE'), 'a replacement needs no EXDATE beside it');
    });

    test('the day of the series is what the box opens on', async () => {
        await open(SERIES);

        const seen = record(['2026-08-06', undefined]);
        await vscode.commands.executeCommand('markdown-org.moveOccurrence');

        assert.deepStrictEqual(seen, ['2026-08-06', '2026-08-06']);
    });

    test('a day the caller names is what the box opens on', async () => {
        await open(SERIES);

        const seen = record([undefined]);
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence', '2026-08-27');

        assert.deepStrictEqual(seen, ['2026-08-27']);
    });

    test('escaping a box leaves the file alone', async () => {
        const doc = await open(SERIES);

        answer(undefined);
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence');

        assert.strictEqual(doc.getText(), SERIES);
    });

    test('an entry that does not repeat is refused, and the file is left alone', async () => {
        const once = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00>`', ''].join('\n');
        const doc = await open(once);

        answer('2026-08-06');
        await vscode.commands.executeCommand('markdown-org.cancelOccurrence');

        assert.strictEqual(doc.getText(), once);
    });
});
