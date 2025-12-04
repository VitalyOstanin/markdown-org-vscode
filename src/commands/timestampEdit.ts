import * as vscode from 'vscode';

const TIMESTAMP_REGEX = /<(\d{4})-(\d{2})-(\d{2})(?: ([А-Яа-яA-Za-z]{2,3}))?(?: (\d{2}):(\d{2}))?>/;
const HEADING_REGEX = /^(#+)\s+(TODO|DONE)?(?:\s+\[#([A-Z])\])?\s+(.*)$/;
const TIMESTAMP_LINE_REGEX = /^`(CREATED|SCHEDULED|DEADLINE): (<[^>]+>)`$/;

type TimestampPart = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute';
type HeadingPart = 'status' | 'priority';
type TimestampType = 'type';

function getTimestampTypeAtCursor(editor: vscode.TextEditor): { match: RegExpMatchArray; range: vscode.Range } | null {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;
    
    const match = lineText.match(TIMESTAMP_LINE_REGEX);
    if (!match) return null;
    
    const typeStart = 1;
    const typeEnd = typeStart + match[1].length;
    
    if (position.character >= typeStart && position.character <= typeEnd) {
        const range = new vscode.Range(position.line, typeStart, position.line, typeEnd);
        return { match, range };
    }
    
    return null;
}

function toggleTimestampType(match: RegExpMatchArray): string {
    const currentType = match[1];
    const timestamp = match[2];
    const newType = currentType === 'SCHEDULED' ? 'DEADLINE' : 'SCHEDULED';
    return `\`${newType}: ${timestamp}\``;
}

function getHeadingPartAtCursor(editor: vscode.TextEditor): { match: RegExpMatchArray; range: vscode.Range; part: HeadingPart } | null {
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
        if (newCode >= 65 && newCode <= 90) {
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

function getTimestampAtCursor(editor: vscode.TextEditor): { match: RegExpMatchArray; range: vscode.Range; part: TimestampPart } | null {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;
    
    let match: RegExpMatchArray | null;
    let regex = new RegExp(TIMESTAMP_REGEX, 'g');
    
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
            
            const range = new vscode.Range(
                position.line, start,
                position.line, end
            );
            
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

export async function adjustTimestamp(delta: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.selection.isEmpty) {
        await vscode.commands.executeCommand(delta > 0 ? 'cursorUpSelect' : 'cursorDownSelect');
        return;
    }
    
    const timestampType = getTimestampTypeAtCursor(editor);
    if (timestampType) {
        const newLine = toggleTimestampType(timestampType.match);
        const lineRange = editor.document.lineAt(editor.selection.active.line).range;
        
        await editor.edit(editBuilder => {
            editBuilder.replace(lineRange, newLine);
        });
        
        const newPosition = editor.selection.active;
        editor.selection = new vscode.Selection(newPosition, newPosition);
        return;
    }
    
    const headingPart = getHeadingPartAtCursor(editor);
    if (headingPart) {
        const newLine = adjustHeadingPart(headingPart.match, headingPart.part, delta);
        const lineRange = editor.document.lineAt(editor.selection.active.line).range;
        
        await editor.edit(editBuilder => {
            editBuilder.replace(lineRange, newLine);
        });
        
        const newPosition = editor.selection.active;
        editor.selection = new vscode.Selection(newPosition, newPosition);
        return;
    }
    
    const timestamp = getTimestampAtCursor(editor);
    if (!timestamp) {
        await vscode.commands.executeCommand(delta > 0 ? 'cursorUpSelect' : 'cursorDownSelect');
        return;
    }
    
    const newTimestamp = incrementTimestamp(timestamp.match, timestamp.part, delta);
    
    await editor.edit(editBuilder => {
        editBuilder.replace(timestamp.range, newTimestamp);
    });
    
    const newPosition = editor.selection.active;
    editor.selection = new vscode.Selection(newPosition, newPosition);
}
