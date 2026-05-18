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

export { formatError };
