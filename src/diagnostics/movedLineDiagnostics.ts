import * as vscode from 'vscode';
import type { DebouncedFunction } from '../utils/debounce';
import { debounce } from '../utils/debounce';
import type { MovedViolation } from './movedPolicy';
import { validateMovedLines } from './movedPolicy';
import { DIAGNOSTIC_SOURCE } from './timestampBrackets';

/**
 * Debounce window for re-validating a document after an edit, the same one the
 * bracket diagnostics use: a typing burst collapses into one pass.
 */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Diagnostic code attached to `MOVED` warnings. The quick-fix provider filters
 * by it so diagnostics from other tools are left alone.
 */
export const MOVED_POLICY_CODE = 'moved-policy';

interface DiagnosticWithViolation extends vscode.Diagnostic {
    _movedViolation?: MovedViolation;
}

/**
 * Walk the document and produce a warning for every `MOVED` line the extractor
 * would refuse. See `movedPolicy.ts` for the rules and why they are repeated
 * here: the extractor reports them where a reader does not look.
 */
export function validateDocument(doc: vscode.TextDocument): vscode.Diagnostic[] {
    const lines: string[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
        lines.push(doc.lineAt(i).text);
    }
    return validateMovedLines(lines).map(toDiagnostic);
}

function toDiagnostic(violation: MovedViolation): vscode.Diagnostic {
    const range = new vscode.Range(violation.line, violation.startCharacter, violation.line, violation.endCharacter);
    const diagnostic: DiagnosticWithViolation = new vscode.Diagnostic(
        range,
        violation.message,
        vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = MOVED_POLICY_CODE;
    diagnostic._movedViolation = violation;
    return diagnostic;
}

/**
 * Quick fixes for the faults the editor can name a correction for -- a bracket
 * form, a repeater, a warning cookie, an hour. A half that is not a date and a
 * day the entry already moved carry no fix: what was meant is not guessable.
 */
export class MovedPolicyCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== DIAGNOSTIC_SOURCE || diagnostic.code !== MOVED_POLICY_CODE) {
                continue;
            }
            const violation = (diagnostic as DiagnosticWithViolation)._movedViolation;
            if (!violation?.fixTitle || violation.replacement === null) continue;

            const action = new vscode.CodeAction(violation.fixTitle, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diagnostic];
            action.isPreferred = true;

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, violation.replacement);
            action.edit = edit;
            actions.push(action);
        }
        return actions;
    }
}

/**
 * Wire the diagnostic collection and the code action provider into the
 * extension lifecycle. Returns a `Disposable` aggregating everything -- the
 * caller pushes it into `context.subscriptions`.
 */
export function registerMovedDiagnostics(context: vscode.ExtensionContext): vscode.Disposable {
    const collection = vscode.languages.createDiagnosticCollection('markdown-org-moved');
    context.subscriptions.push(collection);

    const refresh = (doc: vscode.TextDocument) => {
        if (doc.languageId !== 'markdown') {
            collection.delete(doc.uri);
            return;
        }
        collection.set(doc.uri, validateDocument(doc));
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
        }),
        vscode.languages.registerCodeActionsProvider({ language: 'markdown' }, new MovedPolicyCodeActionProvider(), {
            providedCodeActionKinds: MovedPolicyCodeActionProvider.providedCodeActionKinds
        })
    );

    return collection;
}
