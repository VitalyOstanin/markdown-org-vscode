import * as vscode from 'vscode';
import { HEADING_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';
import { formatDurationHM } from '../utils';
import {
    getTimestampPartAt,
    getClockTimestampPartAt,
    TimestampPart,
    ClockTimestampPart
} from '../utils/timestampParts';

const PRIORITY_A_CODE = 'A'.charCodeAt(0);
const PRIORITY_Z_CODE = 'Z'.charCodeAt(0);

type HeadingPart = 'status' | 'priority';

function getClockTimestampAtCursor(
    editor: vscode.TextEditor
): { match: RegExpMatchArray; part: ClockTimestampPart } | null {
    const position = editor.selection.active;
    const lineText = editor.document.lineAt(position.line).text;
    return getClockTimestampPartAt(lineText, position.character);
}

function getTimestampTypeAtCursor(editor: vscode.TextEditor): { match: RegExpMatchArray; range: vscode.Range } | null {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;

    const match = lineText.match(TIMESTAMP_LINE_REGEX);
    if (!match?.groups) return null;

    const type = match.groups.type;
    const typeStart = lineText.indexOf(type);
    const typeEnd = typeStart + type.length;

    if (position.character >= typeStart && position.character <= typeEnd) {
        const range = new vscode.Range(position.line, typeStart, position.line, typeEnd);
        return { match, range };
    }

    return null;
}

function toggleTimestampType(match: RegExpMatchArray): string {
    const { indent, type: currentType, timestamp } = match.groups!;

    if (currentType === 'CREATED') {
        return `${indent}\`${currentType}: ${timestamp}\``;
    }

    const types = ['SCHEDULED', 'DEADLINE', 'CLOSED'];
    const currentIndex = types.indexOf(currentType);
    const newIndex = (currentIndex + 1) % types.length;
    const newType = types[newIndex];
    return `${indent}\`${newType}: ${timestamp}\``;
}

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
        const currentCode = priority.charCodeAt(0);
        const newCode = currentCode + delta;
        if (newCode >= PRIORITY_A_CODE && newCode <= PRIORITY_Z_CODE) {
            newPriority = String.fromCharCode(newCode);
        }
    }

    let result = `${hashes} `;
    if (newStatus) {
        result += `${newStatus} `;
    }
    if (newPriority) {
        result += `[#${newPriority}] `;
    }
    result += title;

    return result;
}

function getTimestampAtCursor(
    editor: vscode.TextEditor
): { match: RegExpMatchArray; range: vscode.Range; part: TimestampPart } | null {
    const position = editor.selection.active;
    const lineText = editor.document.lineAt(position.line).text;
    const hit = getTimestampPartAt(lineText, position.character);
    if (!hit) return null;
    const range = new vscode.Range(position.line, hit.start, position.line, hit.end);
    return { match: hit.match, range, part: hit.part };
}

function incrementTimestamp(match: RegExpMatchArray, part: TimestampPart, delta: number): string {
    const g = match.groups!;
    let year = parseInt(g.year, 10);
    let month = parseInt(g.month, 10);
    let day = parseInt(g.day, 10);
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

    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();

    const newWeekday = weekday ? getWeekdayName(date, weekday) : '';

    let result = `<${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    if (newWeekday) {
        result += ` ${newWeekday}`;
    }
    if (hour !== undefined && minute !== undefined) {
        const newHour = date.getHours();
        const newMinute = date.getMinutes();
        result += ` ${newHour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
    }
    if (repeater) {
        result += ` ${repeater}`;
    }
    result += '>';

    return result;
}

function getWeekdayName(date: Date, originalFormat: string): string {
    const isRussian = /[А-Яа-я]/.test(originalFormat);
    const isFull = originalFormat.length > 3;
    const dayIndex = date.getDay();

    if (isRussian) {
        const days = isFull
            ? ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
            : ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        return days[dayIndex];
    } else {
        const days = isFull
            ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[dayIndex];
    }
}

function adjustClockTimestamp(match: RegExpMatchArray, part: ClockTimestampPart, delta: number): string {
    const g = match.groups!;
    const indent = g.indent;
    const startBracket = g.startOpenBracket;
    const endBracket = g.startCloseBracket;

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
    const startTimestamp = `${startBracket}${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')} ${newStartWeekday} ${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}${endBracket}`;

    if (!g.endOpenBracket) {
        return `${indent}\`CLOCK: ${startTimestamp}\``;
    }

    const endStartBracket = g.endOpenBracket;
    const endEndBracket = g.endCloseBracket;

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
    const endTimestamp = `${endStartBracket}${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')} ${newEndWeekday} ${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}${endEndBracket}`;

    const duration = formatDurationHM(endDate.getTime() - startDate.getTime(), { padHoursWithSpace: true });

    return `${indent}\`CLOCK: ${startTimestamp}--${endTimestamp} => ${duration}\``;
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

        return editor
            .edit((editBuilder) => {
                editBuilder.replace(lineRange, newLine);
            })
            .then(() => {
                const newPosition = editor.selection.active;
                editor.selection = new vscode.Selection(newPosition, newPosition);
            });
    }

    const timestamp = getTimestampAtCursor(editor);
    if (timestamp) {
        const newTimestamp = incrementTimestamp(timestamp.match, timestamp.part, delta);

        return editor
            .edit((editBuilder) => {
                editBuilder.replace(timestamp.range, newTimestamp);
            })
            .then(() => {
                const newPosition = editor.selection.active;
                editor.selection = new vscode.Selection(newPosition, newPosition);
            });
    }

    const timestampType = getTimestampTypeAtCursor(editor);
    if (timestampType) {
        const newLine = toggleTimestampType(timestampType.match);
        const lineRange = editor.document.lineAt(editor.selection.active.line).range;

        return editor
            .edit((editBuilder) => {
                editBuilder.replace(lineRange, newLine);
            })
            .then(() => {
                const newPosition = editor.selection.active;
                editor.selection = new vscode.Selection(newPosition, newPosition);
            });
    }

    const headingPart = getHeadingPartAtCursor(editor);
    if (headingPart) {
        const newLine = adjustHeadingPart(headingPart.match, headingPart.part, delta);
        const lineRange = editor.document.lineAt(editor.selection.active.line).range;

        return editor
            .edit((editBuilder) => {
                editBuilder.replace(lineRange, newLine);
            })
            .then(() => {
                const newPosition = editor.selection.active;
                editor.selection = new vscode.Selection(newPosition, newPosition);
            });
    }

    return vscode.commands.executeCommand(delta > 0 ? 'cursorUpSelect' : 'cursorDownSelect');
}
