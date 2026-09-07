import * as vscode from 'vscode';
import { documentLines, registerDocumentDiagnostics } from './registerDiagnostics';
import type { MovedViolation } from './movedPolicy';
import { validateMovedLines } from './movedPolicy';
import { DIAGNOSTIC_SOURCE } from './timestampBrackets';

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
    return validateMovedLines(documentLines(doc)).map(toDiagnostic);
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

/** Name of the collection these rules fill, as the Problems panel shows it. */
export const MOVED_COLLECTION = 'markdown-org-moved';

/**
 * Wire the `MOVED` diagnostics into the editor, on the terms every diagnostic
 * of this extension lives by (`registerDocumentDiagnostics`).
 */
export function registerMovedDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
    return registerDocumentDiagnostics(context, {
        name: MOVED_COLLECTION,
        validate: validateDocument,
        provider: new MovedPolicyCodeActionProvider(),
        providedCodeActionKinds: MovedPolicyCodeActionProvider.providedCodeActionKinds
    });
}
