/**
 * Which of the agenda's source files are open with edits VS Code has not
 * written to disk yet.
 *
 * The agenda's line numbers come from the extractor reading the file on disk;
 * `AgendaPanel.openTaskInEditor` then applies that number to whatever document
 * `vscode.workspace.openTextDocument` hands back -- the live, dirty one when
 * the file is already open with unsaved edits. An insertion or deletion above
 * the target line shifts the buffer's own numbering away from the disk's, and
 * a click lands on the wrong row until the file is saved. This is the header
 * chip that says so, the same way the git chip says a file is not yet pushed.
 *
 * Kept free of the Git extension entirely: a dirty buffer is a VS Code fact,
 * present whether or not the file is under version control at all.
 */
import * as vscode from 'vscode';
import type { AgendaDirtyStatus, DirtyFileState } from '../types';
import { pathApi, pathKey } from './git/gitPathMatch';
import { resolveRealPath } from './git/realPath';

/**
 * Build the status for `files`, resolving symlinks the same way the git
 * status does: a file reached through a symlink in the agenda's own root can
 * be the very one VS Code opened by its real path, or the other way round, and
 * a plain string compare would miss the match.
 */
export async function collectDirtyStatus(files: readonly string[]): Promise<AgendaDirtyStatus> {
    const dirtyDocs = vscode.workspace.textDocuments.filter((doc) => doc.isDirty);
    if (files.length === 0 || dirtyDocs.length === 0) {
        return { files: [] };
    }
    const realPathCache = new Map<string, string>();
    const dirtyKeys = new Set(
        await Promise.all(dirtyDocs.map(async (doc) => pathKey(await resolveRealPath(doc.uri.fsPath, realPathCache))))
    );
    const result: DirtyFileState[] = [];
    for (const file of files) {
        const real = await resolveRealPath(file, realPathCache);
        if (dirtyKeys.has(pathKey(real))) {
            result.push({ file, label: pathApi().basename(file) });
        }
    }
    return { files: result };
}
