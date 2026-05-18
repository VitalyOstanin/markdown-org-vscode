import * as vscode from 'vscode';
import {
    findNearestHeading,
    formatDurationHM,
    formatOrgTimestamp,
    getTimestampIndent,
    requireActiveEditor
} from '../utils';
import { CLOCK_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';
import { notifyWarn } from '../utils/notify';

function formatTimestamp(date: Date): string {
    return formatOrgTimestamp(date, 'square');
}

function roundTime(date: Date, roundMinutes: number | undefined): Date {
    if (!roundMinutes) {
        return date;
    }

    const result = new Date(date);
    const minutes = result.getMinutes();
    const rounded = Math.floor(minutes / roundMinutes) * roundMinutes;
    result.setMinutes(rounded);
    result.setSeconds(0);
    result.setMilliseconds(0);

    return result;
}

function roundEndTime(startDate: Date, endDate: Date, roundMinutes: number | undefined): Date {
    if (!roundMinutes) {
        return endDate;
    }

    const result = new Date(endDate);
    const minutes = result.getMinutes();
    const rounded = Math.ceil(minutes / roundMinutes) * roundMinutes;
    result.setMinutes(rounded);
    result.setSeconds(0);
    result.setMilliseconds(0);

    if (result <= startDate) {
        result.setMinutes(result.getMinutes() + roundMinutes);
    }

    return result;
}

function calculateDuration(start: Date, end: Date): string {
    return formatDurationHM(end.getTime() - start.getTime(), { padHoursWithSpace: true });
}

function findClockLines(editor: vscode.TextEditor, headingLine: number): number[] {
    const clockLines: number[] = [];

    for (let i = headingLine + 1; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i);
        const text = line.text;

        if (text.match(TIMESTAMP_LINE_REGEX)) {
            continue;
        }

        if (text.match(CLOCK_REGEX)) {
            clockLines.push(i);
            continue;
        }

        if (text.trim() === '' && clockLines.length > 0) {
            continue;
        }

        break;
    }

    return clockLines;
}

function findOpenClock(editor: vscode.TextEditor, clockLines: number[]): number | null {
    // endCloseBracket is the optional end-bracket group; if absent, the CLOCK entry is open
    for (const lineNum of clockLines) {
        const line = editor.document.lineAt(lineNum);
        const match = line.text.match(CLOCK_REGEX);
        if (match?.groups && !match.groups.endCloseBracket) {
            return lineNum;
        }
    }
    return null;
}

/** Open a new CLOCK entry under the nearest heading. Refuses if an open CLOCK already exists for that heading. */
export async function insertClockStart() {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    const clockLines = findClockLines(editor, headingLine);
    const openClockLine = findOpenClock(editor, clockLines);

    if (openClockLine !== null) {
        notifyWarn('There is already an open CLOCK entry');
        return;
    }

    const config = vscode.workspace.getConfiguration('markdown-org');
    const roundMinutes = config.get<number>('clockRoundMinutes');

    const now = new Date();
    const rounded = roundTime(now, roundMinutes);
    const timestamp = formatTimestamp(rounded);

    const indent = getTimestampIndent(editor, headingLine);
    const newLine = `${indent}\`CLOCK: ${timestamp}\``;

    let insertLine: number;
    if (clockLines.length > 0) {
        insertLine = clockLines[clockLines.length - 1] + 1;
    } else {
        let lastTimestampLine = headingLine;
        for (let i = headingLine + 1; i < editor.document.lineCount; i++) {
            const line = editor.document.lineAt(i);
            if (line.text.match(TIMESTAMP_LINE_REGEX)) {
                lastTimestampLine = i;
            } else {
                break;
            }
        }
        insertLine = lastTimestampLine + 1;
    }

    const insertPosition = new vscode.Position(insertLine, 0);

    return editor.edit((editBuilder) => {
        editBuilder.insert(insertPosition, `${newLine}\n`);
    });
}

/** Close the open CLOCK entry under the nearest heading and append the elapsed duration. */
export async function insertClockFinish() {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    const clockLines = findClockLines(editor, headingLine);
    const openClockLine = findOpenClock(editor, clockLines);

    if (openClockLine === null) {
        notifyWarn('No open CLOCK entry found');
        return;
    }

    const line = editor.document.lineAt(openClockLine);
    const match = line.text.match(CLOCK_REGEX);
    if (!match?.groups) {
        return;
    }

    const { indent, startYear: y, startMonth: m, startDay: d, startBody } = match.groups;
    const startYear = parseInt(y, 10);
    const startMonth = parseInt(m, 10);
    const startDay = parseInt(d, 10);

    const timeMatch = startBody.match(/(\d{2}):(\d{2})$/);
    if (!timeMatch) {
        return;
    }
    const startHour = parseInt(timeMatch[1], 10);
    const startMinute = parseInt(timeMatch[2], 10);
    const startDate = new Date(startYear, startMonth - 1, startDay, startHour, startMinute);

    const config = vscode.workspace.getConfiguration('markdown-org');
    const roundMinutes = config.get<number>('clockRoundMinutes');

    const now = new Date();
    if (now < startDate) {
        notifyWarn('open CLOCK starts in the future; finishing anyway');
    }
    const endDate = roundEndTime(startDate, now, roundMinutes);
    const endTimestamp = formatTimestamp(endDate);

    const duration = calculateDuration(startDate, endDate);
    const startTimestamp = formatTimestamp(startDate);

    const newLine = `${indent}\`CLOCK: ${startTimestamp}--${endTimestamp} => ${duration}\``;

    return editor.edit((editBuilder) => {
        editBuilder.replace(line.range, newLine);
    });
}
