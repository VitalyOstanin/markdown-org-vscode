import * as vscode from 'vscode';
import { findNearestHeading } from '../utils';

function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const weekday = dayNames[date.getDay()];
    
    return `<${year}-${month}-${day} ${weekday} ${hour}:${minute}>`;
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
    const match = text.match(/^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);
    
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

    return editor.edit(editBuilder => {
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
    const match = text.match(/^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);
    
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

    return editor.edit(editBuilder => {
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
    
    const timestampLineRegex = /^(\s*)`(CREATED|SCHEDULED|DEADLINE|CLOSED): <[^>]+>`$/;
    for (let i = headingLine + 1; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        const tsMatch = lineText.match(timestampLineRegex);
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
    
    return editor.edit(editBuilder => {
        editBuilder.insert(insertPosition, `${indent}\`CREATED: ${timestamp}\`\n`);
    });
}

function getTimestampIndent(editor: vscode.TextEditor, headingLine: number): string {
    const timestampRegex = /^(\s*)`(CREATED|SCHEDULED|DEADLINE|CLOSED): <[^>]+>`$/;
    
    if (headingLine + 1 < editor.document.lineCount) {
        const line = editor.document.lineAt(headingLine + 1);
        const match = line.text.match(timestampRegex);
        if (match) {
            return match[1];
        }
    }
    
    return '';
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
        const match = line.text.match(/^(\s*)`(CREATED|SCHEDULED|DEADLINE): (<[^>]+>)`$/);
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
        return editor.edit(editBuilder => {
            editBuilder.delete(deleteRange);
        });
    }

    const indent = getTimestampIndent(editor, headingLine);
    const timestamp = formatTimestamp(new Date());
    const insertPosition = new vscode.Position(blockEnd, 0);

    return editor.edit(editBuilder => {
        editBuilder.insert(insertPosition, `${indent}\`${type}: ${timestamp}\`\n`);
    });
}
