import * as vscode from 'vscode';
import * as path from 'path';
import { TIMESTAMP_LINE_REGEX } from './orgPatterns';

export const DAY_NAMES_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Format a Date as `<YYYY-MM-DD Ru HH:MM>` (angle) or `[...]` (square) in org-mode style. */
export function formatOrgTimestamp(date: Date, bracket: 'angle' | 'square'): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const weekday = DAY_NAMES_SHORT[date.getDay()];
    const open = bracket === 'angle' ? '<' : '[';
    const close = bracket === 'angle' ? '>' : ']';
    return `${open}${year}-${month}-${day} ${weekday} ${hour}:${minute}${close}`;
}

/** Format a duration in ms as `H:MM`; pad hours with leading space for table alignment if requested. */
export function formatDurationHM(durationMs: number, opts?: { padHoursWithSpace?: boolean }): string {
    const totalMinutes = Math.floor(durationMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursStr = opts?.padHoursWithSpace ? hours.toString().padStart(2, ' ') : hours.toString();
    return `${hoursStr}:${minutes.toString().padStart(2, '0')}`;
}

/** Format a Date as a local `YYYY-MM-DD` string (no timezone conversion). */
export function toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Detect the indent (leading whitespace) of an existing timestamp line below the heading, or empty. */
export function getTimestampIndent(editor: vscode.TextEditor, headingLine: number): string {
    if (headingLine + 1 < editor.document.lineCount) {
        const line = editor.document.lineAt(headingLine + 1);
        const match = line.text.match(TIMESTAMP_LINE_REGEX);
        if (match) {
            return match[1];
        }
    }
    return '';
}

/** Check that an absolute path is contained within any open workspace folder. */
export function isPathInsideWorkspace(filePath: string): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return false;
    }
    const resolved = path.resolve(filePath);
    return folders.some((folder) => {
        const folderPath = path.resolve(folder.uri.fsPath);
        if (resolved === folderPath) {
            return true;
        }
        const rel = path.relative(folderPath, resolved);
        return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
}

/** Resolve a possibly-relative path against the first workspace folder; absolute paths pass through. */
export function resolveWorkspacePath(p: string): string {
    if (path.isAbsolute(p)) {
        return p;
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        return p;
    }
    return path.resolve(root, p);
}

/** Return the active editor or null; shows 'No active editor' message. With markdownOnly, silently returns null for non-markdown. */
export function requireActiveEditor(opts?: { markdownOnly?: boolean }): vscode.TextEditor | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return null;
    }
    if (opts?.markdownOnly && editor.document.languageId !== 'markdown') {
        return null;
    }
    return editor;
}

/** Find the nearest heading containing the cursor and return its line, or null after showing 'No heading found'. */
export async function requireHeadingAtCursor(editor: vscode.TextEditor): Promise<number | null> {
    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        vscode.window.showErrorMessage('No heading found');
        return null;
    }
    return headingLine;
}

/**
 * Find the innermost heading whose document symbol contains the cursor.
 * Falls back to a manual upward scan if no document symbols are available.
 */
export async function findNearestHeading(editor: vscode.TextEditor): Promise<number | null> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    );

    const position = editor.selection.active;

    if (symbols && symbols.length > 0) {
        function findHeading(syms: vscode.DocumentSymbol[], parentLine?: number): number | null {
            let bestMatch: number | null = parentLine ?? null;

            for (const sym of syms) {
                if (sym.range.contains(position)) {
                    const symLine = sym.range.start.line;
                    bestMatch = symLine;

                    if (sym.children && sym.children.length > 0) {
                        const childMatch = findHeading(sym.children, symLine);
                        if (childMatch !== null) {
                            bestMatch = childMatch;
                        }
                    }
                    break;
                }
            }

            return bestMatch;
        }

        return findHeading(symbols);
    }

    // Fallback if symbols not available
    for (let line = position.line; line >= 0; line--) {
        const text = editor.document.lineAt(line).text;
        if (/^#+\s+/.test(text)) {
            return line;
        }
    }

    return null;
}
