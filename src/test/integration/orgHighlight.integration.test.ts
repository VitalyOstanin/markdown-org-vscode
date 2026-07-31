import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { suite, test, teardown } from 'mocha';
import type { HighlightKind } from '../../utils/orgHighlightSpans';
import { documentDecorationRanges } from '../../decorations/orgHighlight';

/**
 * `TextEditor.setDecorations` is a non-writable property, so a test cannot
 * observe the call the highlighter makes. What it can check is the input to
 * that call for a real `TextDocument`: the ranges, resolved back to the text
 * they cover, and the kind each one was filed under.
 */
function painted(document: vscode.TextDocument): string[] {
    const out: string[] = [];
    for (const [kind, ranges] of documentDecorationRanges(document)) {
        for (const range of ranges) {
            out.push(`${kind}:${document.getText(range)}`);
        }
    }
    return out.sort();
}

async function openMarkdown(...lines: string[]): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
}

suite('Editor highlighting of org constructs', () => {
    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('a planning line indented by four spaces is decorated', async () => {
        // Four spaces is the case the markdown grammar gives up on (indented
        // code block), and the one that made these decorations necessary.
        const doc = await openMarkdown('### TODO [#A] Задача', '    `SCHEDULED: <2026-03-03 Tue 10:00 +7d>`');
        assert.deepStrictEqual(painted(doc), [
            'date:2026-03-03',
            'planning-scheduled:SCHEDULED',
            'priority-a:[#A]',
            'repeater:+7d',
            'status-todo:TODO',
            'time:10:00',
            'weekday:Tue'
        ]);
    });

    test('the same line yields the same decorations at every indentation', async () => {
        // The decorations do not care how deep the line sits; the punctuation
        // between them is the injection grammar's business.
        const texts = ['`SCHEDULED: <2026-03-03 Fri>`', '  `SCHEDULED: <2026-03-03 Fri>`'];
        const deep = await openMarkdown('    `SCHEDULED: <2026-03-03 Fri>`');
        const expected = painted(deep);
        assert.deepStrictEqual(expected, ['date:2026-03-03', 'planning-scheduled:SCHEDULED', 'weekday:Fri']);
        for (const text of texts) {
            const doc = await openMarkdown(text);
            assert.deepStrictEqual(painted(doc), expected, `indentation changed the decorations: ${text}`);
        }
    });

    test('the ranges land on the right lines', async () => {
        const doc = await openMarkdown('# Заголовок', '', '    `DEADLINE: <2026-03-05 Thu>`');
        const deadline = documentDecorationRanges(doc).get('planning-deadline');
        assert.ok(deadline, 'the DEADLINE keyword was decorated');
        assert.strictEqual(deadline.length, 1);
        const range = deadline[0]!;
        assert.strictEqual(range.start.line, 2);
        assert.strictEqual(doc.getText(range), 'DEADLINE');
    });

    test('a document without org constructs gets no ranges', async () => {
        const doc = await openMarkdown('# Заголовок', '', 'Обычный абзац без задач и без дат.');
        assert.deepStrictEqual(painted(doc), []);
    });

    test('a non-markdown document is left alone', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'plaintext',
            content: '`SCHEDULED: <2026-03-03 Tue>`'
        });
        assert.deepStrictEqual(painted(doc), []);
    });

    test('the setting turns the decorations off', async () => {
        const doc = await openMarkdown('    `SCHEDULED: <2026-03-03 Tue>`');
        const config = vscode.workspace.getConfiguration();
        await config.update('markdown-org.highlightInEditor', false, vscode.ConfigurationTarget.Global);
        try {
            assert.deepStrictEqual(painted(doc), []);
        } finally {
            await config.update('markdown-org.highlightInEditor', undefined, vscode.ConfigurationTarget.Global);
        }
        const kindsAfterReset: HighlightKind[] = [...documentDecorationRanges(doc).keys()];
        assert.ok(kindsAfterReset.length > 0, 'clearing the setting brings the decorations back');
    });
});
