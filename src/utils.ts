import * as vscode from 'vscode';
import * as path from 'path';
import { TIMESTAMP_LINE_REGEX } from './orgPatterns';

export const DAY_NAMES_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

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

export function formatDurationHM(durationMs: number, opts?: { padHoursWithSpace?: boolean }): string {
    const totalMinutes = Math.floor(durationMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursStr = opts?.padHoursWithSpace ? hours.toString().padStart(2, ' ') : hours.toString();
    return `${hoursStr}:${minutes.toString().padStart(2, '0')}`;
}

export function toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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
