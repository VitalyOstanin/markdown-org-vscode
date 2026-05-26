import * as vscode from 'vscode';
import { validateLines, BracketViolation } from './bracketPolicy';
import { debounce, DebouncedFunction } from '../utils/debounce';

/**
 * Debounce window for re-validating a document after an edit. Without it the
 * whole document is re-scanned synchronously on every keystroke; 300ms
 * collapses a typing burst into one pass (the agenda debounces similarly).
 */
const REFRESH_DEBOUNCE_MS = 300;

/** Source string surfaced on every diagnostic this module produces. */
export const DIAGNOSTIC_SOURCE = 'markdown-org';

/**
 * Diagnostic code attached to bracket-policy warnings. Quick-fix actions
 * filter by this so unrelated diagnostics from other tools are ignored.
 */
export const BRACKET_POLICY_CODE = 'bracket-policy';

interface DiagnosticWithViolation extends vscode.Diagnostic {
    _bracketViolation?: BracketViolation;
}

/**
 * Walk the document and produce diagnostics for every line that violates
 * the ADR-0014 bracket policy. See `bracketPolicy.ts` for the pure rule.
 */
export function validateDocument(doc: vscode.TextDocument): vscode.Diagnostic[] {
    const lines: string[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
        lines.push(doc.lineAt(i).text);
    }
    return validateLines(lines).map(toDiagnostic);
}

function toDiagnostic(violation: BracketViolation): vscode.Diagnostic {
    const range = new vscode.Range(violation.line, violation.startCharacter, violation.line, violation.endCharacter);
    const diagnostic: DiagnosticWithViolation = new vscode.Diagnostic(
        range,
        violation.message,
        vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = BRACKET_POLICY_CODE;
    diagnostic._bracketViolation = violation;
    return diagnostic;
}

/**
 * Quick-fix provider: for every bracket-policy diagnostic at the cursor
 * offer "Convert to canonical bracket form" that rewrites the timestamp's
 * opening and closing brackets in place.
 */
export class BracketPolicyCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== DIAGNOSTIC_SOURCE || diagnostic.code !== BRACKET_POLICY_CODE) {
                continue;
            }
            const violation = (diagnostic as DiagnosticWithViolation)._bracketViolation;
            if (!violation) continue;

            const canonical = `${violation.requiredOpen}${violation.inner}${violation.requiredClose}`;
            const action = new vscode.CodeAction(`Convert to ${canonical}`, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diagnostic];
            action.isPreferred = true;

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, canonical);
            action.edit = edit;
            actions.push(action);
        }
        return actions;
    }
}

/**
 * Wire the diagnostic collection and the code action provider into the
 * extension lifecycle. Returns a `Disposable` aggregating everything --
 * the caller pushes it into `context.subscriptions`.
 */
export function registerBracketDiagnostics(context: vscode.ExtensionContext): vscode.Disposable {
    const collection = vscode.languages.createDiagnosticCollection('markdown-org-brackets');
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

    // Edits are debounced per-document so a typing burst triggers one re-scan,
    // not one per keystroke. Open/close stay immediate (they are not bursty).
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
        vscode.workspace.onDidChangeTextDocument((e) => scheduleRefresh(e.document)),
        vscode.workspace.onDidCloseTextDocument((doc) => {
            const key = doc.uri.toString();
            debouncedByUri.get(key)?.cancel();
            debouncedByUri.delete(key);
            collection.delete(doc.uri);
        }),
        vscode.languages.registerCodeActionsProvider({ language: 'markdown' }, new BracketPolicyCodeActionProvider(), {
            providedCodeActionKinds: BracketPolicyCodeActionProvider.providedCodeActionKinds
        })
    );

    return collection;
}
