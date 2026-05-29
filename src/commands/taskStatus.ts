import * as vscode from 'vscode';
import { findNearestHeading, formatOrgTimestamp, getTimestampIndent, requireActiveEditor } from '../utils';
import { HEADING_REGEX, matchTimestampLine } from '../orgPatterns';
import { buildHeading } from '../utils/buildHeading';
import { normalizeTaskType } from '../utils/normalizeTaskType';

function formatActiveTimestamp(date: Date): string {
    return formatOrgTimestamp(date, 'angle');
}

function formatInactiveTimestamp(date: Date): string {
    return formatOrgTimestamp(date, 'square');
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

    if (!match?.groups) {
        return;
    }

    const { hashes, status: currentStatus, priority, title } = match.groups;

    // Toggle: re-applying the same keyword clears it, anything else sets it.
    const newText = buildHeading({
        hashes,
        status: currentStatus !== status ? status : undefined,
        priority,
        title
    });

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

    if (!match?.groups) {
        return;
    }

    const { hashes, status, priority: currentPriority, title } = match.groups;

    // Toggle: clear an existing priority, otherwise default a fresh one to A.
    // `status` is the raw HEADING_REGEX capture (string | undefined); normalize
    // it to the typed TaskStatus boundary. HEADING_REGEX only captures
    // TODO/DONE/CANCELLED, so this is observably identical to passing it through.
    const newText = buildHeading({
        hashes,
        status: normalizeTaskType(status),
        priority: currentPriority ? undefined : 'A',
        title
    });

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
        const hit = matchTimestampLine(editor.document.lineAt(i).text);
        if (!hit) {
            break;
        }
        if (hit.type === 'CREATED') {
            return;
        }
    }

    const indent = getTimestampIndent(editor, headingLine);
    // ADR-0014: CREATED is inactive `[...]` (Emacs `org-expiry` convention).
    const timestamp = formatInactiveTimestamp(new Date());
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
        const hit = matchTimestampLine(editor.document.lineAt(i).text);
        if (!hit) {
            break;
        }
        if (hit.type === type) {
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
    // ADR-0014: SCHEDULED and DEADLINE are active `<...>`.
    const timestamp = formatActiveTimestamp(new Date());
    const insertPosition = new vscode.Position(blockEnd, 0);

    return editor.edit((editBuilder) => {
        editBuilder.insert(insertPosition, `${indent}\`${type}: ${timestamp}\`\n`);
    });
}
