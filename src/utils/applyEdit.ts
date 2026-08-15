/**
 * Apply an edit to the open document and say so when it was refused.
 *
 * `TextEditor.edit` answers `false` rather than throwing when the edit does not
 * land -- the document moved on since the ranges were computed, or another edit
 * is in flight. Dropped, that is a command that quietly does nothing, and the
 * user is left to guess whether the keystroke registered. The destructive path
 * already reports it (`cutBlockThenWrite` in moveHeading.ts); this is the same
 * answer for the in-buffer edits.
 *
 * Returns whether the edit landed, so a caller with something to do afterwards
 * -- collapsing a selection, for one -- can hold off until it did.
 */
import type * as vscode from 'vscode';
import { notifyError } from './notify';

export async function applyEditOrReport(
    editor: vscode.TextEditor,
    build: (editBuilder: vscode.TextEditorEdit) => void,
    what: string
): Promise<boolean> {
    const applied = await editor.edit(build);
    if (!applied) {
        notifyError(`The edit was rejected: ${what} was not written`);
    }
    return applied;
}
