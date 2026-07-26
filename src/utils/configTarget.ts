import * as vscode from 'vscode';

/**
 * Where a setting written by the extension should live.
 *
 * With a folder open the value belongs to that workspace -- the tag filter and
 * the calendar id are per-project choices. Without one there is no workspace
 * file to write to, so the value has to go to the user's global settings or the
 * update silently fails.
 */
export function preferredConfigTarget(hasWorkspace: boolean): vscode.ConfigurationTarget {
    return hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

/** {@link preferredConfigTarget} for the workspace currently open in VS Code. */
export function currentConfigTarget(): vscode.ConfigurationTarget {
    return preferredConfigTarget((vscode.workspace.workspaceFolders?.length ?? 0) > 0);
}
