import * as vscode from 'vscode';
import { findNearestHeading, formatOrgTimestamp, getTimestampIndent, requireActiveEditor } from '../utils';
import { HEADING_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';

function formatTimestamp(date: Date): string {
    return formatOrgTimestamp(date, 'angle');
}

/** Toggle the TODO/DONE keyword on the nearest heading; preserves priority. Silent if no active markdown editor. */
export async function setTaskStatus(status: 'TODO' | 'DONE') {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
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

/** Toggle priority `[#A]` on the nearest heading; preserves TODO/DONE keyword. */
export async function togglePriority() {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
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

/** Insert a `CREATED:` timestamp under the heading. No-op if any CREATED line already exists in the timestamp block. */
export async function insertCreatedTimestamp() {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
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

/** Insert a `SCHEDULED:` timestamp; repeating the call removes it (toggle). DEADLINE on the heading is preserved. */
export async function insertScheduledTimestamp() {
    await insertOrReplaceTimestamp('SCHEDULED');
}

/** Insert a `DEADLINE:` timestamp; repeating the call removes it (toggle). SCHEDULED on the heading is preserved. */
export async function insertDeadlineTimestamp() {
    await insertOrReplaceTimestamp('DEADLINE');
}

async function insertOrReplaceTimestamp(type: 'SCHEDULED' | 'DEADLINE') {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    // Walk the consecutive timestamp block after the heading and collect every
    // existing line for `type` (a file may have duplicates after a manual edit).
    // Other timestamps (CREATED, otherType) are independent and must be preserved.
    const existingLines: number[] = [];
    let blockEnd = headingLine + 1;

    for (let i = headingLine + 1; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i);
        const match = line.text.match(TIMESTAMP_LINE_REGEX);
        if (!match) {
            break;
        }
        if (match[2] === type) {
            existingLines.push(i);
        }
        blockEnd = i + 1;
    }

    if (existingLines.length > 0) {
        // editor.edit applies the supplied deletes atomically against the
        // original document positions, so the indices don't need to be
        // compensated as previous lines disappear.
        return editor.edit((editBuilder) => {
            for (const lineNum of existingLines) {
                editBuilder.delete(new vscode.Range(lineNum, 0, lineNum + 1, 0));
            }
        });
    }

    const indent = getTimestampIndent(editor, headingLine);
    const timestamp = formatTimestamp(new Date());
    const insertPosition = new vscode.Position(blockEnd, 0);

    return editor.edit((editBuilder) => {
        editBuilder.insert(insertPosition, `${indent}\`${type}: ${timestamp}\`\n`);
    });
}
