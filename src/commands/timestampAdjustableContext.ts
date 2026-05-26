import * as vscode from 'vscode';
import { shouldGateTimestampAdjust } from '../utils/adjustablePosition';

/**
 * When-context that gates the Shift+Up / Shift+Down keybindings
 * (`timestampUp` / `timestampDown`). It is true only when the keystroke would
 * adjust something rather than extend a selection, so VS Code's built-in
 * `cursorUpSelect` / `cursorDownSelect` keep working everywhere else.
 */
const CONTEXT_KEY = 'markdown-org.timestampAdjustable';

/**
 * The keybinding should win over line-selection only for a single, empty
 * caret sitting on an adjustable token in a markdown editor. A non-empty
 * selection (the user is mid-selection, possibly passing over a heading or
 * timestamp) or multiple carets must always fall through to the built-in
 * selection commands -- that was the #10 bug.
 */
function computeAdjustable(editor: vscode.TextEditor | undefined): boolean {
    if (!editor) return false;
    const selection = editor.selection;
    return shouldGateTimestampAdjust({
        languageId: editor.document.languageId,
        selectionCount: editor.selections.length,
        selectionEmpty: selection.isEmpty,
        lineText: editor.document.lineAt(selection.active.line).text,
        character: selection.active.character
    });
}

export function registerTimestampAdjustableContext(context: vscode.ExtensionContext): void {
    const update = (): void => {
        void vscode.commands.executeCommand(
            'setContext',
            CONTEXT_KEY,
            computeAdjustable(vscode.window.activeTextEditor)
        );
    };

    // Seed the context immediately so the first Shift+Up/Down after activation
    // is gated correctly, then keep it in sync with cursor and editor changes.
    update();
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => update()),
        vscode.window.onDidChangeTextEditorSelection(() => update())
    );
}
