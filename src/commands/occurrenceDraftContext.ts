import * as vscode from 'vscode';
import { matchOccurrenceDraft } from '../utils/occurrenceDraft';

/**
 * When-context that gates the keys answering a drafted move: Ctrl+Enter
 * writes it, Escape takes it back. Both are keys the editor already uses, so
 * they are claimed only while a draft is actually standing in the document
 * and fall through to their usual meaning the rest of the time.
 */
const CONTEXT_KEY = 'markdown-org.occurrenceDraft';

/**
 * Whether the document holds a draft.
 *
 * Read from the document rather than remembered from the command that wrote
 * it: the draft is a line of the notes like any other, and it survives a
 * window reload, an undo, and being typed by hand -- none of which a variable
 * in the extension would have heard about.
 */
function holdsDraft(document: vscode.TextDocument): boolean {
    for (let line = 0; line < document.lineCount; line++) {
        if (matchOccurrenceDraft(document.lineAt(line).text)) {
            return true;
        }
    }
    return false;
}

export function registerOccurrenceDraftContext(context: vscode.ExtensionContext): void {
    let seen: { uri: string; version: number } | null = null;

    const update = (force = false): void => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId !== 'markdown') {
            seen = null;
            void vscode.commands.executeCommand('setContext', CONTEXT_KEY, false);
            return;
        }
        // The scan walks the whole file, so it is run when the text changes
        // rather than on every caret move: a long day of notes is thousands
        // of lines, and the answer cannot change while only the caret does.
        const at = { uri: editor.document.uri.toString(), version: editor.document.version };
        if (!force && seen?.uri === at.uri && seen.version === at.version) {
            return;
        }
        seen = at;
        void vscode.commands.executeCommand('setContext', CONTEXT_KEY, holdsDraft(editor.document));
    };

    update(true);
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            update(true);
        }),
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                update();
            }
        })
    );
}
