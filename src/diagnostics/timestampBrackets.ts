import * as vscode from 'vscode';
import type { BracketViolation } from './bracketPolicy';
import { validateLines } from './bracketPolicy';
import { documentLines, registerDocumentDiagnostics } from './registerDiagnostics';

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
    return validateLines(documentLines(doc)).map(toDiagnostic);
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
 * Wire the bracket-policy diagnostics into the editor, on the terms every
 * diagnostic of this extension lives by (`registerDocumentDiagnostics`).
 */
export function registerBracketDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
    return registerDocumentDiagnostics(context, {
        name: 'markdown-org-brackets',
        validate: validateDocument,
        provider: new BracketPolicyCodeActionProvider(),
        providedCodeActionKinds: BracketPolicyCodeActionProvider.providedCodeActionKinds
    });
}
