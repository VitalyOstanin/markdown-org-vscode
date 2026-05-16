import * as vscode from 'vscode';
import { findNearestHeading, formatOrgTimestamp, getTimestampIndent } from '../utils';
import { HEADING_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';

function formatTimestamp(date: Date): string {
    return formatOrgTimestamp(date, 'angle');
}

export async function setTaskStatus(status: 'TODO' | 'DONE') {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    const line = editor.document.lineAt(headingLine);
    const text = line.text;
    const match = text.match(HEADING_REGEX);

    if (!match) {
        return;
    }

    const [, hashes, currentStatus, priority, title] = match;

    let newText = `${hashes} `;
    if (currentStatus !== status) {
        newText += `${status} `;
    }
    if (priority) {
        newText += `[#${priority}] `;
    }
    newText += title;

    return editor.edit((editBuilder) => {
        editBuilder.replace(line.range, newText);
    });
}

export async function togglePriority() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    const line = editor.document.lineAt(headingLine);
    const text = line.text;
    const match = text.match(HEADING_REGEX);

    if (!match) {
        return;
    }

    const [, hashes, status, currentPriority, title] = match;

    let newText = `${hashes} `;
    if (status) {
        newText += `${status} `;
    }
    if (!currentPriority) {
        newText += `[#A] `;
    }
    newText += title;

    return editor.edit((editBuilder) => {
        editBuilder.replace(line.range, newText);
    });
}

export async function insertCreatedTimestamp() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    for (let i = headingLine + 1; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        const tsMatch = lineText.match(TIMESTAMP_LINE_REGEX);
        if (!tsMatch) {
            break;
        }
        if (tsMatch[2] === 'CREATED') {
            return;
        }
    }

    const indent = getTimestampIndent(editor, headingLine);
    const timestamp = formatTimestamp(new Date());
    const insertPosition = new vscode.Position(headingLine + 1, 0);

    return editor.edit((editBuilder) => {
        editBuilder.insert(insertPosition, `${indent}\`CREATED: ${timestamp}\`\n`);
    });
}

export async function insertScheduledTimestamp() {
    await insertOrReplaceTimestamp('SCHEDULED');
}

export async function insertDeadlineTimestamp() {
    await insertOrReplaceTimestamp('DEADLINE');
}

async function insertOrReplaceTimestamp(type: 'SCHEDULED' | 'DEADLINE') {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    // Walk the consecutive timestamp block after the heading and find the
    // existing line for `type` (if any). Other timestamps (CREATED, otherType)
    // are independent and must be preserved.
    let existingLine: number | null = null;
    let blockEnd = headingLine + 1;

    for (let i = headingLine + 1; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i);
        const match = line.text.match(TIMESTAMP_LINE_REGEX);
        if (!match) {
            break;
        }
        if (match[2] === type) {
            existingLine = i;
        }
        blockEnd = i + 1;
    }

    if (existingLine !== null) {
        const deleteRange = new vscode.Range(existingLine, 0, existingLine + 1, 0);
        return editor.edit((editBuilder) => {
            editBuilder.delete(deleteRange);
        });
    }

    const indent = getTimestampIndent(editor, headingLine);
    const timestamp = formatTimestamp(new Date());
    const insertPosition = new vscode.Position(blockEnd, 0);

    return editor.edit((editBuilder) => {
        editBuilder.insert(insertPosition, `${indent}\`${type}: ${timestamp}\`\n`);
    });
}
