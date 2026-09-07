import * as vscode from 'vscode';
import type { DebouncedFunction } from '../utils/debounce';
import { debounce } from '../utils/debounce';

/**
 * Debounce window for re-validating a document after an edit: a typing burst
 * collapses into one pass. One window for every diagnostic this extension
 * registers -- two collections re-scanning the same file on different clocks
 * is two answers about the same keystroke.
 */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * The document as an array of lines, which is what every rule here reads.
 *
 * `getText()` once rather than `lineAt` per line: the walk runs on every edit
 * (debounced) and over the whole file, and `lineAt` builds a `TextLine` object
 * -- range, first non-whitespace, the lot -- for each of them. The rest of the
 * extension already reads a document this way.
 */
export function documentLines(doc: vscode.TextDocument): string[] {
    return doc.getText().split(/\r?\n/);
}

/**
 * The document version each collection last walked, per document.
 *
 * Test-only, and the reason it exists is a test that proved nothing: waiting
 * for "no diagnostics" is satisfied by a collection that has not been filled
 * yet, so a rule could stop reporting and the wait would still return, at once
 * and green. The version rather than a count, because an editor reuses the uri
 * of an untitled document it closed, and a count left over from the previous
 * one would answer for the new document.
 */
const walkedVersionByCollection = new Map<string, number>();

/** The version of `uri` the collection named `name` last walked, if any. */
export function walkedVersionForTesting(name: string, uri: vscode.Uri): number | undefined {
    return walkedVersionByCollection.get(`${name}\u0000${uri.toString()}`);
}

/** What one diagnostic collection needs to be wired into the editor. */
export interface DocumentDiagnostics {
    /** Name of the collection, as it appears in the Problems panel's source. */
    name: string;
    /** The rules themselves: a document in, its warnings out. */
    validate: (doc: vscode.TextDocument) => vscode.Diagnostic[];
    /** The provider offering the fixes for those warnings. */
    provider: vscode.CodeActionProvider;
    /** The kinds that provider offers, as its own static field declares them. */
    providedCodeActionKinds: readonly vscode.CodeActionKind[];
}

/**
 * Wire a diagnostic collection and its code action provider into the editor.
 *
 * The single answer to "how does a diagnostic of this extension live": scan
 * every document already open, re-scan on open and on edit (debounced per
 * document, so a typing burst is one pass), drop the diagnostics of a document
 * that closes, and register the fixes. Every collection wants the same wiring,
 * and writing it again per collection is how the two that existed came to
 * differ in their comments while agreeing in their code.
 *
 * Everything registered goes into `context.subscriptions` here. The returned
 * value is the collection itself -- for a caller that wants to read or clear
 * it -- and disposing it does not undo the listeners, which the extension
 * lifecycle owns.
 */
export function registerDocumentDiagnostics(
    context: vscode.ExtensionContext,
    { name, validate, provider, providedCodeActionKinds }: DocumentDiagnostics
): vscode.DiagnosticCollection {
    const collection = vscode.languages.createDiagnosticCollection(name);
    context.subscriptions.push(collection);

    const noteWalk = (doc: vscode.TextDocument) => {
        walkedVersionByCollection.set(`${name}\u0000${doc.uri.toString()}`, doc.version);
    };

    const refresh = (doc: vscode.TextDocument) => {
        if (doc.languageId !== 'markdown') {
            collection.delete(doc.uri);
            noteWalk(doc);
            return;
        }
        collection.set(doc.uri, validate(doc));
        noteWalk(doc);
    };

    for (const doc of vscode.workspace.textDocuments) {
        refresh(doc);
    }

    const debouncedByUri = new Map<string, DebouncedFunction<[vscode.TextDocument]>>();
    const scheduleRefresh = (doc: vscode.TextDocument) => {
        const key = doc.uri.toString();
        let pending = debouncedByUri.get(key);
        if (!pending) {
            pending = debounce(refresh, REFRESH_DEBOUNCE_MS);
            debouncedByUri.set(key, pending);
        }
        pending(doc);
    };

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(refresh),
        vscode.workspace.onDidChangeTextDocument((e) => {
            scheduleRefresh(e.document);
        }),
        vscode.workspace.onDidCloseTextDocument((doc) => {
            const key = doc.uri.toString();
            debouncedByUri.get(key)?.cancel();
            debouncedByUri.delete(key);
            collection.delete(doc.uri);
            walkedVersionByCollection.delete(`${name}\u0000${key}`);
        }),
        vscode.languages.registerCodeActionsProvider({ language: 'markdown' }, provider, {
            providedCodeActionKinds: [...providedCodeActionKinds]
        })
    );

    return collection;
}
