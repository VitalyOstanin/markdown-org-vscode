import * as vscode from 'vscode';
import { HEADING_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';
import { formatDurationHM } from '../utils';

const TIMESTAMP_REGEX =
    /<(\d{4})-(\d{2})-(\d{2})(?: ([А-Яа-яA-Za-z]{2,3}))?(?: (\d{2}):(\d{2}))?(?: (\+\d+[dwmy]{1,2}))?>/;
// Local variant of the CLOCK regex with weekday and time as separate groups
// so cursor offsets can target individual parts; orgPatterns.CLOCK_REGEX uses
// a broader `[^\]>]+` form for general matching.
const CLOCK_REGEX =
    /^(\s*)`CLOCK: ([[<])(\d{4})-(\d{2})-(\d{2}) ([А-Яа-яA-Za-z]+) (\d{2}):(\d{2})([\]>])(?:--([[<])(\d{4})-(\d{2})-(\d{2}) ([А-Яа-яA-Za-z]+) (\d{2}):(\d{2})([\]>]) => +(-?\d+):(-?\d+))?`$/;
const PRIORITY_A_CODE = 'A'.charCodeAt(0);
const PRIORITY_Z_CODE = 'Z'.charCodeAt(0);

type TimestampPart = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute';
type HeadingPart = 'status' | 'priority';
type ClockTimestampPart =
    | 'start-year'
    | 'start-month'
    | 'start-day'
    | 'start-weekday'
    | 'start-hour'
    | 'start-minute'
    | 'end-year'
    | 'end-month'
    | 'end-day'
    | 'end-weekday'
    | 'end-hour'
    | 'end-minute';

function getClockTimestampAtCursor(
    editor: vscode.TextEditor
): { match: RegExpMatchArray; part: ClockTimestampPart } | null {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;

    const match = lineText.match(CLOCK_REGEX);
    if (!match || match.index === undefined) return null;

    const fullMatch = match[0];
    const cur = position.character;

    // Find all timestamps in the CLOCK line
    const timestampRegex = /(\d{4})-(\d{2})-(\d{2}) ([А-Яа-яA-Za-z]+) (\d{2}):(\d{2})/g;
    const timestamps = [...fullMatch.matchAll(timestampRegex)];

    if (timestamps.length === 0) return null;

    // Check start timestamp
    const startTs = timestamps[0];
    const startBase = match.index + startTs.index!;

    if (cur >= startBase && cur < startBase + 4) return { match, part: 'start-year' };
    if (cur >= startBase + 5 && cur < startBase + 7) return { match, part: 'start-month' };
    if (cur >= startBase + 8 && cur < startBase + 10) return { match, part: 'start-day' };

    const startWeekdayPos = startBase + 11;
    const startWeekdayLen = startTs[4].length;
    if (cur >= startWeekdayPos && cur < startWeekdayPos + startWeekdayLen) return { match, part: 'start-weekday' };

    const startTimePos = startWeekdayPos + startWeekdayLen + 1;
    if (cur >= startTimePos && cur <= startTimePos + 2) return { match, part: 'start-hour' };
    if (cur >= startTimePos + 3 && cur <= startTimePos + 5) return { match, part: 'start-minute' };

    // Check end timestamp if exists
    if (match[10] && timestamps.length > 1) {
        const endTs = timestamps[1];
        const endBase = match.index + endTs.index!;

        if (cur >= endBase && cur < endBase + 4) return { match, part: 'end-year' };
        if (cur >= endBase + 5 && cur < endBase + 7) return { match, part: 'end-month' };
        if (cur >= endBase + 8 && cur < endBase + 10) return { match, part: 'end-day' };

        const endWeekdayPos = endBase + 11;
        const endWeekdayLen = endTs[4].length;
        if (cur >= endWeekdayPos && cur < endWeekdayPos + endWeekdayLen) return { match, part: 'end-weekday' };

        const endTimePos = endWeekdayPos + endWeekdayLen + 1;
        if (cur >= endTimePos && cur <= endTimePos + 2) return { match, part: 'end-hour' };
        if (cur >= endTimePos + 3 && cur <= endTimePos + 5) return { match, part: 'end-minute' };
    }

    return null;
}

function getTimestampTypeAtCursor(editor: vscode.TextEditor): { match: RegExpMatchArray; range: vscode.Range } | null {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;

    const match = lineText.match(TIMESTAMP_LINE_REGEX);
    if (!match) return null;

    const typeStart = lineText.indexOf(match[2]);
    const typeEnd = typeStart + match[2].length;

    if (position.character >= typeStart && position.character <= typeEnd) {
        const range = new vscode.Range(position.line, typeStart, position.line, typeEnd);
        return { match, range };
    }

    return null;
}

function toggleTimestampType(match: RegExpMatchArray): string {
    const indent = match[1];
    const currentType = match[2];
    const timestamp = match[3];

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
    if (!match) return null;

    const hashesEnd = match[1].length + 1;

    if (match[2]) {
        const statusStart = lineText.indexOf(match[2], hashesEnd);
        const statusEnd = statusStart + match[2].length;

        if (position.character >= statusStart && position.character <= statusEnd) {
            const range = new vscode.Range(position.line, statusStart, position.line, statusEnd);
            return { match, range, part: 'status' };
        }
    }

    if (match[3]) {
        const priorityPattern = `[#${match[3]}]`;
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
    const hashes = match[1];
    const status = match[2] || '';
    const priority = match[3] || '';
    const title = match[4];

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
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;

    let match: RegExpMatchArray | null;
    const regex = new RegExp(TIMESTAMP_REGEX, 'g');

    while ((match = regex.exec(lineText)) !== null) {
        const start = match.index!;
        const end = start + match[0].length;

        if (position.character >= start && position.character < end) {
            const yearStart = start + 1;
            const yearEnd = yearStart + 4;
            const monthStart = yearEnd + 1;
            const monthEnd = monthStart + 2;
            const dayStart = monthEnd + 1;
            const dayEnd = dayStart + 2;

            let part: TimestampPart;
            if (position.character >= yearStart && position.character <= yearEnd) {
                part = 'year';
            } else if (position.character >= monthStart && position.character <= monthEnd) {
                part = 'month';
            } else if (position.character >= dayStart && position.character <= dayEnd) {
                part = 'day';
            } else if (match[4]) {
                const weekdayStart = lineText.indexOf(match[4], dayEnd);
                const weekdayEnd = weekdayStart + match[4].length;

                if (position.character >= weekdayStart && position.character <= weekdayEnd) {
                    part = 'weekday';
                } else if (match[5] && match[6]) {
                    const hourStart = lineText.indexOf(match[5], weekdayEnd);
                    const hourEnd = hourStart + 2;
                    const minuteStart = hourEnd + 1;
                    const minuteEnd = minuteStart + 2;

                    if (position.character >= hourStart && position.character <= hourEnd) {
                        part = 'hour';
                    } else if (position.character >= minuteStart && position.character <= minuteEnd) {
                        part = 'minute';
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }
            } else if (match[5] && match[6]) {
                const hourStart = lineText.indexOf(match[5], dayEnd);
                const hourEnd = hourStart + 2;
                const minuteStart = hourEnd + 1;
                const minuteEnd = minuteStart + 2;

                if (position.character >= hourStart && position.character <= hourEnd) {
                    part = 'hour';
                } else if (position.character >= minuteStart && position.character <= minuteEnd) {
                    part = 'minute';
                } else {
                    continue;
                }
            } else {
                continue;
            }

            const range = new vscode.Range(position.line, start, position.line, end);

            return { match, range, part };
        }
    }

    return null;
}

function incrementTimestamp(match: RegExpMatchArray, part: TimestampPart, delta: number): string {
    let year = parseInt(match[1]);
    let month = parseInt(match[2]);
    let day = parseInt(match[3]);
    const weekday = match[4] || '';
    const hour = match[5] ? parseInt(match[5]) : undefined;
    const minute = match[6] ? parseInt(match[6]) : undefined;
    const repeater = match[7] || '';

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
    const indent = match[1];
    const startBracket = match[2];
    const endBracket = match[9];

    const startDate = new Date(
        parseInt(match[3]),
        parseInt(match[4]) - 1,
        parseInt(match[5]),
        parseInt(match[7]),
        parseInt(match[8])
    );
    const startWeekday = match[6];

    // Adjust start date based on part
    if (part === 'start-year') startDate.setFullYear(startDate.getFullYear() + delta);
    else if (part === 'start-month') startDate.setMonth(startDate.getMonth() + delta);
    else if (part === 'start-day' || part === 'start-weekday') startDate.setDate(startDate.getDate() + delta);
    else if (part === 'start-hour') startDate.setHours(startDate.getHours() + delta);
    else if (part === 'start-minute') startDate.setMinutes(startDate.getMinutes() + delta);

    const newStartWeekday = getWeekdayName(startDate, startWeekday);
    const startTimestamp = `${startBracket}${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')} ${newStartWeekday} ${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}${endBracket}`;

    if (!match[10]) {
        return `${indent}\`CLOCK: ${startTimestamp}\``;
    }

    const endStartBracket = match[10];
    const endEndBracket = match[17];

    const endDate = new Date(
        parseInt(match[11]),
        parseInt(match[12]) - 1,
        parseInt(match[13]),
        parseInt(match[15]),
        parseInt(match[16])
    );
    const endWeekday = match[14];

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
