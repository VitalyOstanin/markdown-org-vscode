/**
 * Acting on a whole band of overdue entries, and putting it back.
 *
 * The rules of the edit itself live in `utils/bulkGroupEdit.ts`, which knows
 * nothing about the editor; this module is the part that touches documents:
 * it reads each file once, hands its lines to the planner, writes the result
 * back through a single edit and keeps what it overwrote so the whole move can
 * be undone from the toast that reports it.
 *
 * Undo is the safety here rather than a confirmation prompt, which is what the
 * Android client settles on too: a band of twelve entries is answered in one
 * press, and a modal in front of every press is what stops it being one.
 */
import * as vscode from 'vscode';
import { planGroupEdit } from '../utils/bulkGroupEdit';
import type { BulkAction, BulkRefusal, BulkTarget } from '../utils/bulkGroupEdit';
import type { AgendaStrings, UiLanguage } from '../utils/agendaI18n';
import { formatString, pluralIndex } from '../utils/agendaI18n';
import { formatError, notifyError, notifyStatus } from '../utils/notify';
import { logDiagnostic } from '../utils/logChannel';

/** One file the last action rewrote, and the two texts that bracket it. */
interface FileRollback {
    file: string;
    before: string;
    after: string;
}

/**
 * What the last group action overwrote.
 *
 * Module state rather than a parameter: the offer to undo outlives the call
 * that made it (the user reads the toast, then decides), and a single agenda
 * panel means a single last action.
 */
let lastRollback: FileRollback[] = [];

/**
 * Apply one action to every target, file by file.
 *
 * A file that refuses every one of its targets is not written at all, and a
 * target the planner refused is named in the log rather than being reported as
 * a failure of the whole band -- the rest of the group still goes through, which
 * is the property that makes this worth having over N single edits.
 */
export async function applyGroupAction(
    action: BulkAction,
    targets: readonly BulkTarget[],
    strings: AgendaStrings,
    uiLang: UiLanguage
): Promise<boolean> {
    const byFile = new Map<string, BulkTarget[]>();
    for (const target of targets) {
        const list = byFile.get(target.file) ?? [];
        list.push(target);
        byFile.set(target.file, list);
    }

    const rollback: FileRollback[] = [];
    const refusals: BulkRefusal[] = [];
    let applied = 0;
    const today = new Date();

    for (const [file, fileTargets] of byFile) {
        try {
            const written = await rewriteFile(file, fileTargets, action, today);
            refusals.push(...written.refusals);
            applied += written.applied;
            if (written.rollback) {
                rollback.push(written.rollback);
            }
        } catch (error) {
            // One unreadable or unwritable file does not take the ones that
            // already went through: what was changed is on disk and the undo
            // offer has to name it, so the failure is logged and the loop
            // carries on.
            const reason = formatError(error);
            logDiagnostic(`group action failed on ${file}: ${reason}`);
            notifyError(`group action failed: ${reason}`);
        }
    }

    for (const refusal of refusals) {
        logDiagnostic(`group action left ${refusal.file}:${refusal.line} alone (${refusal.reason}): ${refusal.detail}`);
    }

    if (applied === 0) {
        notifyStatus(strings.group.nothing);
        return false;
    }

    lastRollback = rollback;
    // Not awaited: the toast stays on screen until the user answers it, and
    // the caller's refresh must not wait for that -- the band was emptied when
    // the files were written, not when the notice was dismissed.
    void reportApplied(action, applied, refusals.length, strings, uiLang).catch((error: unknown) => {
        logDiagnostic(`group action report failed: ${formatError(error)}`);
    });
    return true;
}

/** The one file's part of the move: what it refused, and what it overwrote. */
async function rewriteFile(
    file: string,
    targets: readonly BulkTarget[],
    action: BulkAction,
    today: Date
): Promise<{ applied: number; refusals: BulkRefusal[]; rollback?: FileRollback }> {
    const uri = vscode.Uri.file(file);
    // Through the document rather than the file system: a note the user has
    // open with unsaved changes is what they see in the agenda's source, and
    // writing the on-disk text back over it would drop those changes. This also
    // puts the rewrite on the editor's own undo stack.
    const document = await vscode.workspace.openTextDocument(uri);
    const before = document.getText();
    const plan = planGroupEdit({ lines: before.split(/\r?\n/), targets, action, today });
    if (plan.applied === 0) {
        return { applied: 0, refusals: plan.refusals };
    }

    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const after = plan.lines.join(eol);
    if (after === before) {
        return { applied: 0, refusals: plan.refusals };
    }
    await replaceDocument(document, after);
    return { applied: plan.applied, refusals: plan.refusals, rollback: { file, before, after } };
}

/** Replace the whole document and save it. */
async function replaceDocument(document: vscode.TextDocument, text: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    edit.replace(document.uri, whole, text);
    if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error(`the edit was rejected for ${document.uri.fsPath}`);
    }
    await document.save();
}

/** Say what happened, and offer to put it back while the offer is fresh. */
async function reportApplied(
    action: BulkAction,
    applied: number,
    refused: number,
    strings: AgendaStrings,
    uiLang: UiLanguage
): Promise<void> {
    const done = formatString(appliedTemplate(action, strings), countTasks(applied, strings, uiLang));
    const message =
        refused > 0 ? `${done} ${formatString(strings.group.refused, countTasks(refused, strings, uiLang))}` : done;
    const choice = await vscode.window.showInformationMessage(message, strings.group.undo);
    if (choice === strings.group.undo) {
        await undoLastGroupAction(strings, uiLang);
    }
}

function appliedTemplate(action: BulkAction, strings: AgendaStrings): string {
    if (action === 'move-to-today') {
        return strings.group.moved;
    }
    return action === 'drop-planning' ? strings.group.dropped : strings.group.cancelled;
}

/**
 * Put back what the last group action overwrote.
 *
 * A file that no longer holds what was written -- a sync landed, the user
 * edited it, another group action followed -- is left as it is: the undo puts
 * back one move, and overwriting whatever came after it would be a second,
 * unasked-for move.
 */
export async function undoLastGroupAction(strings: AgendaStrings, uiLang: UiLanguage): Promise<void> {
    const entries = lastRollback;
    lastRollback = [];
    if (entries.length === 0) {
        return;
    }

    let restored = 0;
    let skipped = 0;
    for (const entry of entries) {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(entry.file));
            if (document.getText() !== entry.after) {
                skipped += 1;
                continue;
            }
            await replaceDocument(document, entry.before);
            restored += 1;
        } catch (error) {
            skipped += 1;
            logDiagnostic(`group action undo failed on ${entry.file}: ${formatError(error)}`);
        }
    }

    if (restored === 0) {
        notifyStatus(strings.group.undoNothing);
        return;
    }
    const message = formatString(strings.group.undone, countFiles(restored, strings, uiLang));
    notifyStatus(skipped > 0 ? `${message} ${strings.group.undoPartial}` : message);
}

/** Whether an undo is still on offer; the tests read it, nothing else does. */
export function hasGroupRollbackForTesting(): boolean {
    return lastRollback.length > 0;
}

/** Drop the pending rollback, so one test's move is not another's to undo. */
export function clearGroupRollbackForTesting(): void {
    lastRollback = [];
}

function countTasks(n: number, strings: AgendaStrings, uiLang: UiLanguage): string {
    return `${n} ${strings.summary.tasks[pluralIndex(n, uiLang)] ?? ''}`;
}

function countFiles(n: number, strings: AgendaStrings, uiLang: UiLanguage): string {
    return `${n} ${strings.git.files[pluralIndex(n, uiLang)] ?? ''}`;
}
