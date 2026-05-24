import * as assert from 'assert';
import { setTimeout as sleep } from 'node:timers/promises';
import * as vscode from 'vscode';
import { suite, test, teardown } from 'mocha';
import { BRACKET_POLICY_CODE, DIAGNOSTIC_SOURCE } from '../../diagnostics/timestampBrackets';

/**
 * The diagnostic collection is populated asynchronously when the editor
 * opens a document or applies an edit. Wait for the first diagnostic of
 * our source to appear for the given uri, or fail after a short budget.
 */
async function waitForBracketDiagnostics(
    uri: vscode.Uri,
    expected: number,
    timeoutMs = 3000
): Promise<vscode.Diagnostic[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const all = vscode.languages
            .getDiagnostics(uri)
            .filter((d) => d.source === DIAGNOSTIC_SOURCE && d.code === BRACKET_POLICY_CODE);
        if (all.length === expected) {
            return all;
        }
        await sleep(50);
    }
    const observed = vscode.languages
        .getDiagnostics(uri)
        .filter((d) => d.source === DIAGNOSTIC_SOURCE && d.code === BRACKET_POLICY_CODE);
    throw new Error(`expected ${expected} bracket-policy diagnostics, observed ${observed.length}`);
}

suite('Bracket-policy diagnostics + Quick Fix', () => {
    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('canonical lines produce zero diagnostics', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: ['## TODO Task', '`SCHEDULED: <2026-05-25 Пн>`', '`CLOSED: [2026-05-25 Пн]`'].join('\n')
        });
        await vscode.window.showTextDocument(doc);
        await waitForBracketDiagnostics(doc.uri, 0);
    });

    test('CLOSED with legacy `<...>` is reported as a Warning', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: '`CLOSED: <2026-05-25 Пн 19:02>`'
        });
        await vscode.window.showTextDocument(doc);
        const diagnostics = await waitForBracketDiagnostics(doc.uri, 1);
        assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
        assert.match(diagnostics[0].message, /CLOSED requires inactive bracket form/);
    });

    test('SCHEDULED with inactive `[...]` is reported', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: '`SCHEDULED: [2026-05-25 Пн]`'
        });
        await vscode.window.showTextDocument(doc);
        const diagnostics = await waitForBracketDiagnostics(doc.uri, 1);
        assert.match(diagnostics[0].message, /SCHEDULED requires active bracket form/);
    });

    test('mixed pair `<...]` is reported as mixed-pair', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: '`DEADLINE: <2026-05-25 Пн]`'
        });
        await vscode.window.showTextDocument(doc);
        const diagnostics = await waitForBracketDiagnostics(doc.uri, 1);
        assert.match(diagnostics[0].message, /Mixed bracket pair/);
    });

    test('diagnostics refresh on edit (legacy line fixed by hand)', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: '`CLOSED: <2026-05-25 Пн>`'
        });
        const editor = await vscode.window.showTextDocument(doc);
        await waitForBracketDiagnostics(doc.uri, 1);

        await editor.edit((b) => {
            b.replace(new vscode.Range(0, 0, 0, doc.lineAt(0).text.length), '`CLOSED: [2026-05-25 Пн]`');
        });
        await waitForBracketDiagnostics(doc.uri, 0);
    });

    test('non-markdown documents are not validated', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'plaintext',
            content: '`SCHEDULED: [2026-05-25 Пн]`'
        });
        await vscode.window.showTextDocument(doc);
        // Wait a moment so any spurious diagnostics would have a chance
        // to land; the assertion is that none do.
        await sleep(200);
        const ours = vscode.languages
            .getDiagnostics(doc.uri)
            .filter((d) => d.source === DIAGNOSTIC_SOURCE && d.code === BRACKET_POLICY_CODE);
        assert.strictEqual(ours.length, 0, 'plain-text files must not be validated by the bracket rule');
    });

    test('Quick Fix converts `CLOSED: <...>` to canonical `CLOSED: [...]`', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: '`CLOSED: <2026-05-25 Пн 19:02>`'
        });
        const editor = await vscode.window.showTextDocument(doc);
        const [diagnostic] = await waitForBracketDiagnostics(doc.uri, 1);

        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            diagnostic.range,
            vscode.CodeActionKind.QuickFix.value
        );
        const ours = (actions ?? []).filter(
            (a) => a.kind?.value === vscode.CodeActionKind.QuickFix.value && /Convert to/.test(a.title)
        );
        assert.ok(ours.length >= 1, `expected a bracket-policy quick fix, got: ${actions?.map((a) => a.title)}`);

        const edit = ours[0].edit;
        assert.ok(edit, 'quick fix must carry a WorkspaceEdit');
        await vscode.workspace.applyEdit(edit!);

        assert.strictEqual(editor.document.lineAt(0).text, '`CLOSED: [2026-05-25 Пн 19:02]`');
        await waitForBracketDiagnostics(doc.uri, 0);
    });

    test('Quick Fix converts `SCHEDULED: [...]` to canonical `SCHEDULED: <...>`', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: '`SCHEDULED: [2026-05-25 Пн]`'
        });
        const editor = await vscode.window.showTextDocument(doc);
        const [diagnostic] = await waitForBracketDiagnostics(doc.uri, 1);

        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            diagnostic.range,
            vscode.CodeActionKind.QuickFix.value
        );
        const ours = (actions ?? []).filter((a) => /Convert to/.test(a.title));
        assert.ok(ours[0].edit);
        await vscode.workspace.applyEdit(ours[0].edit!);
        assert.strictEqual(editor.document.lineAt(0).text, '`SCHEDULED: <2026-05-25 Пн>`');
    });
});
