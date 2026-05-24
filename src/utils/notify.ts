import * as vscode from 'vscode';
import { formatError } from './formatError';

const ORG_PREFIX = 'Markdown Org: ';

export function notifyError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(ORG_PREFIX + message);
}

export function notifyWarn(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(ORG_PREFIX + message);
}

export function notifyInfo(message: string): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(ORG_PREFIX + message);
}

/**
 * Lightweight in-editor signal: text appears in the status bar (the
 * thin bar along the bottom of the VS Code window) and fades out after
 * the timeout. Used for "something subtle happened" events where a
 * toast would be too noisy -- e.g. the keyword cycle quietly skipped
 * an already-occupied slot.
 */
const DEFAULT_STATUS_TIMEOUT_MS = 3000;
export function notifyStatus(message: string, timeoutMs: number = DEFAULT_STATUS_TIMEOUT_MS): vscode.Disposable {
    return vscode.window.setStatusBarMessage(ORG_PREFIX + message, timeoutMs);
}

export { formatError };
