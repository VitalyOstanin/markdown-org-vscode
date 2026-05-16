import * as vscode from 'vscode';
import { findNearestHeading, formatOrgTimestamp, getTimestampIndent } from '../utils';
import { CLOCK_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';

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
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    return `${hours.toString().padStart(2, ' ')}:${minutes.toString().padStart(2, '0')}`;
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
    // match[8] is the optional end-bracket group; if absent, the CLOCK entry is open
    for (const lineNum of clockLines) {
        const line = editor.document.lineAt(lineNum);
        const match = line.text.match(CLOCK_REGEX);
        if (match && !match[8]) {
            return lineNum;
        }
    }
    return null;
}

export async function insertClockStart() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    const clockLines = findClockLines(editor, headingLine);
    const openClockLine = findOpenClock(editor, clockLines);

    if (openClockLine !== null) {
        vscode.window.showWarningMessage('There is already an open CLOCK entry');
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

export async function insertClockFinish() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    const clockLines = findClockLines(editor, headingLine);
    const openClockLine = findOpenClock(editor, clockLines);

    if (openClockLine === null) {
        vscode.window.showWarningMessage('No open CLOCK entry found');
        return;
    }

    const line = editor.document.lineAt(openClockLine);
    const match = line.text.match(CLOCK_REGEX);
    if (!match) {
        return;
    }

    const indent = match[1];
    const startYear = parseInt(match[3]);
    const startMonth = parseInt(match[4]);
    const startDay = parseInt(match[5]);

    const timeMatch = match[6].match(/(\d{2}):(\d{2})$/);
    if (!timeMatch) {
        return;
    }
    const startHour = parseInt(timeMatch[1]);
    const startMinute = parseInt(timeMatch[2]);
    const startDate = new Date(startYear, startMonth - 1, startDay, startHour, startMinute);

    const config = vscode.workspace.getConfiguration('markdown-org');
    const roundMinutes = config.get<number>('clockRoundMinutes');

    const now = new Date();
    const endDate = roundEndTime(startDate, now, roundMinutes);
    const endTimestamp = formatTimestamp(endDate);

    const duration = calculateDuration(startDate, endDate);
    const startTimestamp = formatTimestamp(startDate);

    const newLine = `${indent}\`CLOCK: ${startTimestamp}--${endTimestamp} => ${duration}\``;

    return editor.edit((editBuilder) => {
        editBuilder.replace(line.range, newLine);
    });
}
