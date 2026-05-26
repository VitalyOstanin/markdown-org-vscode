import * as vscode from 'vscode';
import { HEADING_REGEX, matchTimestampLine, TimestampLineMatch } from '../orgPatterns';
import {
    formatDurationHM,
    DAY_NAMES_SHORT_RU,
    DAY_NAMES_SHORT_EN,
    DAY_NAMES_FULL_RU,
    DAY_NAMES_FULL_EN
} from '../utils';
import { buildOrgTimestamp } from '../utils/orgTimestamp';
import { buildHeading } from '../utils/buildHeading';
import {
    getTimestampPartAt,
    getClockTimestampPartAt,
    TimestampPart,
    ClockTimestampPart
} from '../utils/timestampParts';
import { cycleTimestampKeyword, normaliseBracket } from '../utils/toggleTimestampType';
import { collectSiblingKeywords } from '../utils/headingScan';
import { notifyWarn, notifyStatus } from '../utils/notify';

const PRIORITY_A_CODE = 'A'.charCodeAt(0);
const PRIORITY_Z_CODE = 'Z'.charCodeAt(0);
// Numeric priorities mirror org-mode's `[#0]..[#64]` range -- same bounds
// markdown-org-extract enforces in `Priority::parse`.
const PRIORITY_NUMERIC_MIN = 0;
const PRIORITY_NUMERIC_MAX = 64;

type HeadingPart = 'status' | 'priority';

function getClockTimestampAtCursor(
    editor: vscode.TextEditor
): { match: RegExpMatchArray; part: ClockTimestampPart } | null {
    const position = editor.selection.active;
    const lineText = editor.document.lineAt(position.line).text;
    return getClockTimestampPartAt(lineText, position.character);
}

function getTimestampTypeAtCursor(editor: vscode.TextEditor): { hit: TimestampLineMatch; range: vscode.Range } | null {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;

    const hit = matchTimestampLine(lineText);
    if (!hit) return null;

    // Cycle covers every column on the keyword line that is OUTSIDE
    // the bracketed body: the leading backtick, the keyword token, the
    // colon, the gap between `:` and the opening bracket, the trailing
    // backtick. Columns INSIDE `<...>` / `[...]` belong to the
    // timestamp-part adapter (it may legitimately return null for
    // non-shiftable tokens like a repeater); in that case we must NOT
    // fall through to a keyword cycle -- the user is editing the
    // timestamp interior, not the keyword.
    const timestampStart = lineText.indexOf(hit.timestamp);
    if (timestampStart >= 0) {
        const timestampEnd = timestampStart + hit.timestamp.length;
        if (position.character >= timestampStart && position.character < timestampEnd) {
            return null;
        }
    }

    const typeStart = lineText.indexOf(hit.type);
    const typeEnd = typeStart + hit.type.length;
    const range = new vscode.Range(position.line, typeStart, position.line, typeEnd);
    return { hit, range };
}

// cycleTimestampKeyword lives in utils/toggleTimestampType.ts so that unit tests
// can exercise it without pulling the whole vscode module graph in.

function getHeadingPartAtCursor(
    editor: vscode.TextEditor
): { match: RegExpMatchArray; range: vscode.Range; part: HeadingPart } | null {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;

    const match = lineText.match(HEADING_REGEX);
    if (!match?.groups) return null;

    const { hashes, status, priority } = match.groups;
    const hashesEnd = hashes.length + 1;

    if (status) {
        const statusStart = lineText.indexOf(status, hashesEnd);
        const statusEnd = statusStart + status.length;

        if (position.character >= statusStart && position.character <= statusEnd) {
            const range = new vscode.Range(position.line, statusStart, position.line, statusEnd);
            return { match, range, part: 'status' };
        }
    }

    if (priority) {
        const priorityPattern = `[#${priority}]`;
        const priorityStart = lineText.indexOf(priorityPattern);
        const priorityEnd = priorityStart + priorityPattern.length;

        if (position.character >= priorityStart && position.character <= priorityEnd) {
            const range = new vscode.Range(position.line, priorityStart, position.line, priorityEnd);
            return { match, range, part: 'priority' };
        }
    }

    return null;
}

function adjustHeadingPart(match: RegExpMatchArray, part: HeadingPart, delta: number): string {
    const { hashes, status: rawStatus, priority: rawPriority, title } = match.groups!;
    const status = rawStatus || '';
    const priority = rawPriority || '';

    let newStatus = status;
    let newPriority = priority;

    if (part === 'status') {
        const statuses = ['TODO', 'DONE'];
        const currentIndex = statuses.indexOf(status);
        if (currentIndex !== -1) {
            const newIndex = (currentIndex + delta + statuses.length) % statuses.length;
            newStatus = statuses[newIndex];
        }
    } else if (part === 'priority') {
        if (/^\d+$/.test(priority)) {
            const newValue = parseInt(priority, 10) + delta;
            if (newValue >= PRIORITY_NUMERIC_MIN && newValue <= PRIORITY_NUMERIC_MAX) {
                newPriority = String(newValue);
            }
        } else {
            const currentCode = priority.charCodeAt(0);
            const newCode = currentCode + delta;
            if (newCode >= PRIORITY_A_CODE && newCode <= PRIORITY_Z_CODE) {
                newPriority = String.fromCharCode(newCode);
            }
        }
    }

    return buildHeading({ hashes, status: newStatus, priority: newPriority, title });
}

function getTimestampAtCursor(
    editor: vscode.TextEditor
): { match: RegExpMatchArray; range: vscode.Range; part: TimestampPart; active: boolean } | null {
    const position = editor.selection.active;
    const lineText = editor.document.lineAt(position.line).text;
    const hit = getTimestampPartAt(lineText, position.character);
    if (!hit) return null;
    const range = new vscode.Range(position.line, hit.start, position.line, hit.end);
    return { match: hit.match, range, part: hit.part, active: hit.active };
}

function incrementTimestamp(match: RegExpMatchArray, part: TimestampPart, delta: number, active: boolean): string {
    const g = match.groups!;
    const year = parseInt(g.year, 10);
    const month = parseInt(g.month, 10);
    const day = parseInt(g.day, 10);
    const weekday = g.weekday || '';
    const hour = g.hour ? parseInt(g.hour, 10) : undefined;
    const minute = g.minute ? parseInt(g.minute, 10) : undefined;
    const repeater = g.repeater || '';

    const date = new Date(year, month - 1, day, hour ?? 0, minute ?? 0);

    switch (part) {
        case 'year':
            date.setFullYear(date.getFullYear() + delta);
            break;
        case 'month':
            date.setMonth(date.getMonth() + delta);
            break;
        case 'day':
        case 'weekday':
            date.setDate(date.getDate() + delta);
            break;
        case 'hour':
            date.setHours(date.getHours() + delta);
            break;
        case 'minute':
            date.setMinutes(date.getMinutes() + delta);
            break;
    }

    const newWeekday = weekday ? getWeekdayName(date, weekday) : '';

    return buildOrgTimestamp({
        date,
        bracket: active ? 'angle' : 'square',
        weekday: newWeekday || undefined,
        includeTime: hour !== undefined && minute !== undefined,
        repeater: repeater || undefined
    });
}

function getWeekdayName(date: Date, originalFormat: string): string {
    const isRussian = /[А-Яа-я]/.test(originalFormat);
    const isFull = originalFormat.length > 3;
    const dayIndex = date.getDay();

    if (isRussian) {
        const days = isFull ? DAY_NAMES_FULL_RU : DAY_NAMES_SHORT_RU;
        return days[dayIndex];
    } else {
        const days = isFull ? DAY_NAMES_FULL_EN : DAY_NAMES_SHORT_EN;
        return days[dayIndex];
    }
}

function adjustClockTimestamp(match: RegExpMatchArray, part: ClockTimestampPart, delta: number): string {
    const g = match.groups!;
    const indent = g.indent;
    const startBracket = g.startOpenBracket;

    const startDate = new Date(
        parseInt(g.startYear, 10),
        parseInt(g.startMonth, 10) - 1,
        parseInt(g.startDay, 10),
        parseInt(g.startHour, 10),
        parseInt(g.startMinute, 10)
    );
    const startWeekday = g.startWeekday;

    // Adjust start date based on part
    if (part === 'start-year') startDate.setFullYear(startDate.getFullYear() + delta);
    else if (part === 'start-month') startDate.setMonth(startDate.getMonth() + delta);
    else if (part === 'start-day' || part === 'start-weekday') startDate.setDate(startDate.getDate() + delta);
    else if (part === 'start-hour') startDate.setHours(startDate.getHours() + delta);
    else if (part === 'start-minute') startDate.setMinutes(startDate.getMinutes() + delta);

    const newStartWeekday = getWeekdayName(startDate, startWeekday);
    // The close bracket is derived from the open one: a well-formed CLOCK is
    // always `[...]`, and CLOCK_PARTS_REGEX permits (but org never emits) a
    // mismatched pair like `[...>`, which this normalizes to a matching pair.
    const startTimestamp = buildOrgTimestamp({
        date: startDate,
        bracket: startBracket === '<' ? 'angle' : 'square',
        weekday: newStartWeekday
    });

    if (!g.endOpenBracket) {
        return `${indent}\`CLOCK: ${startTimestamp}\``;
    }

    const endStartBracket = g.endOpenBracket;

    const endDate = new Date(
        parseInt(g.endYear, 10),
        parseInt(g.endMonth, 10) - 1,
        parseInt(g.endDay, 10),
        parseInt(g.endHour, 10),
        parseInt(g.endMinute, 10)
    );
    const endWeekday = g.endWeekday;

    // Adjust end date based on part
    if (part === 'end-year') endDate.setFullYear(endDate.getFullYear() + delta);
    else if (part === 'end-month') endDate.setMonth(endDate.getMonth() + delta);
    else if (part === 'end-day' || part === 'end-weekday') endDate.setDate(endDate.getDate() + delta);
    else if (part === 'end-hour') endDate.setHours(endDate.getHours() + delta);
    else if (part === 'end-minute') endDate.setMinutes(endDate.getMinutes() + delta);

    const newEndWeekday = getWeekdayName(endDate, endWeekday);
    const endTimestamp = buildOrgTimestamp({
        date: endDate,
        bracket: endStartBracket === '<' ? 'angle' : 'square',
        weekday: newEndWeekday
    });

    const duration = formatDurationHM(endDate.getTime() - startDate.getTime(), { padHoursWithSpace: true });

    return `${indent}\`CLOCK: ${startTimestamp}--${endTimestamp} => ${duration}\``;
}

/**
 * Replace `range` with `newText`, then collapse the selection to the cursor
 * caret. Every adjust branch needs the same post-edit cleanup, so it lives
 * here once instead of being repeated as `.edit(...).then(...)` chains.
 */
async function replaceAndCollapseSelection(
    editor: vscode.TextEditor,
    range: vscode.Range,
    newText: string
): Promise<void> {
    await editor.edit((editBuilder) => {
        editBuilder.replace(range, newText);
    });
    const position = editor.selection.active;
    editor.selection = new vscode.Selection(position, position);
}

/**
 * Increment (delta=+1) or decrement (delta=-1) the value under the cursor:
 * a date/time/weekday in a timestamp, a CLOCK timestamp part, a `SCHEDULED`/`DEADLINE` type,
 * or a TODO/priority on a heading. Falls back to cursor-select line motion.
 */
export async function adjustTimestamp(delta: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const clockTimestamp = getClockTimestampAtCursor(editor);
    if (clockTimestamp) {
        const newLine = adjustClockTimestamp(clockTimestamp.match, clockTimestamp.part, delta);
        const lineRange = editor.document.lineAt(editor.selection.active.line).range;
        return replaceAndCollapseSelection(editor, lineRange, newLine);
    }

    const timestamp = getTimestampAtCursor(editor);
    if (timestamp) {
        const newTimestamp = incrementTimestamp(timestamp.match, timestamp.part, delta, timestamp.active);
        return replaceAndCollapseSelection(editor, timestamp.range, newTimestamp);
    }

    const timestampType = getTimestampTypeAtCursor(editor);
    if (timestampType) {
        const cursorLine = editor.selection.active.line;
        const usedKeywords = collectSiblingKeywords(editor.document, cursorLine);
        const cycle = cycleTimestampKeyword(timestampType.hit, usedKeywords);

        if (cycle.from === cycle.to) {
            // Every other keyword is taken by a sibling line under the
            // same heading. A silent no-op feels like a broken keystroke,
            // so escalate to a warning toast that names the occupied
            // siblings.
            const occupied = [...usedKeywords].sort().join(', ');
            notifyWarn(`Cannot cycle ${cycle.from}: ${occupied} are already on this heading.`);
            return;
        }

        if (cycle.skipped.length > 0) {
            // The cycle walked past at least one occupied sibling. Use
            // the status bar (auto-dismissing) instead of a toast so
            // repeated cycling does not flood the user with popups.
            notifyStatus(`Skipped ${cycle.skipped.join(', ')} (already on heading)`);
        }

        const lineRange = editor.document.lineAt(cursorLine).range;
        return replaceAndCollapseSelection(editor, lineRange, cycle.line);
    }

    const headingPart = getHeadingPartAtCursor(editor);
    if (headingPart) {
        const newLine = adjustHeadingPart(headingPart.match, headingPart.part, delta);
        const lineRange = editor.document.lineAt(editor.selection.active.line).range;
        return replaceAndCollapseSelection(editor, lineRange, newLine);
    }

    return vscode.commands.executeCommand(delta > 0 ? 'cursorUpSelect' : 'cursorDownSelect');
}

/**
 * Flip the bracket form of the timestamp under the cursor: active `<...>`
 * <-> inactive `[...]`. Analogue of Emacs `org-toggle-timestamp-type`.
 *
 * Whether a timestamp can switch active form depends on the keyword
 * (ADR-0014):
 *   - bare inline (no keyword) and CLOCK         -- both forms allowed
 *   - SCHEDULED, DEADLINE                        -- active only
 *   - CLOSED, CREATED                            -- inactive only
 *
 * On a SCHEDULED/DEADLINE/CLOSED/CREATED line the command refuses with a
 * keyword-specific message naming the only legal form. CLOCK timestamps
 * are out of scope in this iteration. Outside any timestamp the command
 * is a no-op with a hint.
 */
export async function toggleTimestampActive() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const position = editor.selection.active;
    const lineText = editor.document.lineAt(position.line).text;

    const keywordLine = matchTimestampLine(lineText);
    if (keywordLine) {
        const required = keywordLine.active ? 'active `<...>`' : 'inactive `[...]`';
        notifyWarn(
            `${keywordLine.type} allows only ${required} form (ADR-0014); ` +
                `cycle the keyword via Shift+Up to change it.`
        );
        return;
    }

    const hit = getTimestampPartAt(lineText, position.character);
    if (!hit) {
        notifyWarn('Cursor is not on a timestamp');
        return;
    }

    const newTimestamp = normaliseBracket(hit.match[0], !hit.active);
    const range = new vscode.Range(position.line, hit.start, position.line, hit.end);
    return editor.edit((editBuilder) => {
        editBuilder.replace(range, newTimestamp);
    });
}
