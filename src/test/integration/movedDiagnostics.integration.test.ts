import * as vscode from 'vscode';
import * as assert from 'node:assert';
import { setTimeout as sleep } from 'node:timers/promises';
import { suite, test, teardown } from 'mocha';
import { MOVED_POLICY_CODE } from '../../diagnostics/movedLineDiagnostics';
import { DIAGNOSTIC_SOURCE } from '../../diagnostics/timestampBrackets';

/**
 * The collection is filled asynchronously when a document is opened or edited.
 * Wait for the expected number of `MOVED` diagnostics, or fail after a budget.
 */
async function waitForMovedDiagnostics(
    uri: vscode.Uri,
    expected: number,
    timeoutMs = 3000
): Promise<vscode.Diagnostic[]> {
    const ours = () =>
        vscode.languages
            .getDiagnostics(uri)
            .filter((d) => d.source === DIAGNOSTIC_SOURCE && d.code === MOVED_POLICY_CODE);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const all = ours();
        if (all.length === expected) {
            return all;
        }
        await sleep(50);
    }
    throw new Error(`expected ${expected} moved-policy diagnostics, observed ${ours().length}`);
}

const SERIES = ['## TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`'];

async function open(moved: string): Promise<vscode.TextDocument> {
    const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: [...SERIES, moved].join('\n')
    });
    await vscode.window.showTextDocument(doc);
    return doc;
}

suite('MOVED diagnostics + Quick Fix', () => {
    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('the line the extension writes produces no diagnostic', async () => {
        const doc = await open('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`');
        await waitForMovedDiagnostics(doc.uri, 0);
    });

    test('a repeater on the occurrence is reported as a Warning naming the series', async () => {
        const doc = await open('`MOVED: [2026-08-20 Thu +1w] -> <2026-08-22 Sat 18:00>`');
        const diagnostics = await waitForMovedDiagnostics(doc.uri, 1);
        assert.strictEqual(diagnostics[0]!.severity, vscode.DiagnosticSeverity.Warning);
        assert.match(diagnostics[0]!.message, /repeater \+1w/);
    });

    test('Quick Fix drops the repeater and the warning goes away', async () => {
        const doc = await open('`MOVED: [2026-08-20 Thu +1w] -> <2026-08-22 Sat 18:00>`');
        const [diagnostic] = await waitForMovedDiagnostics(doc.uri, 1);

        const actions = await vscode.commands.executeCommand<vscode.CodeAction[] | undefined>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            diagnostic!.range,
            vscode.CodeActionKind.QuickFix.value
        );
        const ours = (actions ?? []).filter((a) => a.title === 'Drop the repeater');
        assert.ok(ours.length >= 1, `expected the repeater fix, got: ${actions?.map((a) => a.title)}`);
        const edit = ours[0]!.edit;
        assert.ok(edit, 'the quick fix must carry a WorkspaceEdit');
        await vscode.workspace.applyEdit(edit);

        assert.strictEqual(doc.lineAt(2).text, '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`');
        await waitForMovedDiagnostics(doc.uri, 0);
    });

    test('Quick Fix writes the occurrence inactive when it was written active', async () => {
        const doc = await open('`MOVED: <2026-08-20 Thu> -> <2026-08-22 Sat 18:00>`');
        const [diagnostic] = await waitForMovedDiagnostics(doc.uri, 1);

        const actions = await vscode.commands.executeCommand<vscode.CodeAction[] | undefined>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            diagnostic!.range,
            vscode.CodeActionKind.QuickFix.value
        );
        const ours = (actions ?? []).filter((a) => a.title.startsWith('Convert to ['));
        const edit = ours[0]?.edit;
        assert.ok(edit, `expected the bracket fix, got: ${actions?.map((a) => a.title)}`);
        await vscode.workspace.applyEdit(edit);

        assert.strictEqual(doc.lineAt(2).text, '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`');
        await waitForMovedDiagnostics(doc.uri, 0);
    });

    test('a fault with nothing to guess is reported without a fix', async () => {
        const doc = await open('`MOVED: next Thursday -> <2026-08-22 Sat 18:00>`');
        const [diagnostic] = await waitForMovedDiagnostics(doc.uri, 1);

        const actions = await vscode.commands.executeCommand<vscode.CodeAction[] | undefined>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            diagnostic!.range,
            vscode.CodeActionKind.QuickFix.value
        );
        const ours = (actions ?? []).filter((a) => a.title.startsWith('Convert to') || a.title.startsWith('Drop the'));
        assert.strictEqual(ours.length, 0, `expected no fix, got: ${ours.map((a) => a.title)}`);
    });

    test('a warning does not stop the line from being read: the planning line keeps its own', async () => {
        // The bracket diagnostics and these run over the same document; a
        // SCHEDULED written inactive is still reported by its own collection.
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: [
                '## TODO English',
                '`SCHEDULED: [2026-08-06 Thu 15:00 +1w]`',
                '`MOVED: [2026-08-20 Thu +1w] -> <2026-08-22 Sat 18:00>`'
            ].join('\n')
        });
        await vscode.window.showTextDocument(doc);
        const moved = await waitForMovedDiagnostics(doc.uri, 1);
        assert.strictEqual(moved[0]!.range.start.line, 2);
        const brackets = vscode.languages
            .getDiagnostics(doc.uri)
            .filter((d) => d.source === DIAGNOSTIC_SOURCE && d.code === 'bracket-policy');
        assert.strictEqual(brackets.length, 1);
        assert.strictEqual(brackets[0]!.range.start.line, 1);
    });
});
