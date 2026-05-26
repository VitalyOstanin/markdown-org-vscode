import * as vscode from 'vscode';
import * as path from 'path';
import { matchTimestampLine } from './orgPatterns';
import { buildOrgTimestamp } from './utils/orgTimestamp';
import { notifyError } from './utils/notify';

import { DAY_NAMES_SHORT_RU, DAY_NAMES_SHORT_EN, DAY_NAMES_FULL_RU, DAY_NAMES_FULL_EN } from './utils/dayNames';
// Re-export the day-name tables (now defined in the vscode-free dayNames
// module) so existing `import { DAY_NAMES_* } from '../utils'` call sites and
// the locale helpers below keep working unchanged.
export { DAY_NAMES_SHORT_RU, DAY_NAMES_SHORT_EN, DAY_NAMES_FULL_RU, DAY_NAMES_FULL_EN };

/**
 * Legacy export: kept as-is (Russian short names) so any downstream caller
 * that imports it gets the historical behaviour. New code should go through
 * `formatOrgTimestamp`, which respects `markdown-org.weekdayLocale`.
 */
export const DAY_NAMES_SHORT = DAY_NAMES_SHORT_RU;

export type WeekdayLocale = 'ru' | 'en';

/** Read the configured weekday locale (`markdown-org.weekdayLocale`). */
export function getWeekdayLocale(): WeekdayLocale {
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    const value = cfg.get<string>('weekdayLocale', 'ru');
    return value === 'en' ? 'en' : 'ru';
}

/**
 * Format a Date as `<YYYY-MM-DD Day HH:MM>` (angle) or `[...]` (square) in
 * org-mode style. The weekday short name comes from the configured locale --
 * Russian by default, English when `markdown-org.weekdayLocale === 'en'`.
 * Locale can also be forced via the `locale` argument, which is what demo
 * fixtures and unit tests do to stay independent of workspace config.
 */
export function formatOrgTimestamp(date: Date, bracket: 'angle' | 'square', locale?: WeekdayLocale): string {
    const days = (locale ?? getWeekdayLocale()) === 'en' ? DAY_NAMES_SHORT_EN : DAY_NAMES_SHORT_RU;
    return buildOrgTimestamp({ date, bracket, weekday: days[date.getDay()] });
}

/** Format a duration in ms as `H:MM`; pad hours with leading space for table alignment if requested. */
export function formatDurationHM(durationMs: number, opts?: { padHoursWithSpace?: boolean }): string {
    const totalMinutes = Math.floor(durationMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursStr = opts?.padHoursWithSpace ? hours.toString().padStart(2, ' ') : hours.toString();
    return `${hoursStr}:${minutes.toString().padStart(2, '0')}`;
}

export { toIsoDate } from './utils/isoDate';

/** Detect the indent (leading whitespace) of an existing timestamp line below the heading, or empty. */
export function getTimestampIndent(editor: vscode.TextEditor, headingLine: number): string {
    if (headingLine + 1 < editor.document.lineCount) {
        const line = editor.document.lineAt(headingLine + 1);
        const hit = matchTimestampLine(line.text);
        if (hit) {
            return hit.indent;
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
        notifyError('No active editor');
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
        notifyError('No heading found');
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
