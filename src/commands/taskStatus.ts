import * as vscode from 'vscode';
import { findNearestHeading, formatOrgTimestamp, getTimestampIndent, requireActiveEditor } from '../utils';
import { HEADING_REGEX, matchTimestampLine } from '../orgPatterns';
import { buildHeading } from '../utils/buildHeading';
import { computeToggledStatus } from '../utils/normalizeTaskType';
import { planPrioritySet, planPriorityToggle, readHeadingPriority } from '../utils/priorityToggle';
import { PRIORITY_LETTERS, parsePriorityValue } from '../utils/priorityValue';
import { currentUiStrings } from '../utils/uiStrings';
import type { TaskStatus } from '../types';
import { namedGroups } from '../utils/regexGroups';
import { planCompletion, type CompletionPlan } from '../utils/completeRepeatingTask';
import { notifyError } from '../utils/notify';
import { formatError } from '../utils/formatError';
import { applyEditOrReport } from '../utils/applyEdit';

function formatActiveTimestamp(date: Date): string {
    return formatOrgTimestamp(date, 'angle');
}

function formatInactiveTimestamp(date: Date): string {
    return formatOrgTimestamp(date, 'square');
}

/** Toggle the TODO/DONE/CANCELLED/CANCELED keyword on the nearest heading; preserves priority. Silent if no active markdown editor. */
export async function setTaskStatus(status: TaskStatus) {
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

    const { status: currentStatus, priority } = match.groups;
    const { hashes, title } = namedGroups(match, 'hashes', 'title');

    // Toggle rule lives in computeToggledStatus (unit-tested): re-applying the
    // same logical keyword clears it; cancelled spellings count as one status.
    const toggled = computeToggledStatus(currentStatus, status);

    // Org-mode does not close a task that repeats: this occurrence is done and
    // the next one is due later, so the planning dates move and the keyword
    // goes back to open (ADR-0017). Only when DONE is being applied — clearing
    // it, or marking the task cancelled, moves nothing.
    if (toggled === 'DONE') {
        const plan = planRepeatingCompletion(editor, headingLine);
        if (plan === undefined) {
            return; // the repeater is there and cannot be advanced; said so already
        }
        if (plan.repeated) {
            const reopened = buildHeading({
                hashes,
                // A heading that carries no keyword keeps carrying none: the
                // user asked for the date to move, not for the line to become
                // a task. Same rule as the core's.
                status: currentStatus ? 'TODO' : undefined,
                priority,
                title
            });

            return applyEditOrReport(
                editor,
                (editBuilder) => {
                    editBuilder.replace(line.range, reopened);
                    for (const shifted of plan.planning) {
                        editBuilder.replace(editor.document.lineAt(shifted.line).range, shifted.text);
                    }
                },
                'the repeating task'
            );
        }
    }

    const newText = buildHeading({
        hashes,
        status: toggled,
        priority,
        title
    });

    return applyEditOrReport(
        editor,
        (editBuilder) => {
            editBuilder.replace(line.range, newText);
        },
        'the task keyword'
    );
}

/**
 * What completing the task at `headingLine` moves, or `undefined` when a
 * repeater is there but cannot be advanced — in which case the user has been
 * told and nothing should be written.
 *
 * `wd` is the case that cannot be advanced: working days depend on the public
 * calendar, and the extractor publishes the holidays but not the Saturdays
 * moved to working (`--holidays` carries one of the two lists). Counting
 * without them would put the editor a day or two off the phone, which is the
 * disagreement this whole path exists to remove.
 */
function planRepeatingCompletion(editor: vscode.TextEditor, headingLine: number): CompletionPlan | undefined {
    const lines = editor.document.getText().split(/\r?\n/);

    try {
        return planCompletion({ lines, heading: headingLine, today: new Date() });
    } catch (error) {
        notifyError(`Cannot move the repeating task: ${formatError(error)}`);
        return undefined;
    }
}

/** Shorthand for `setTaskStatus('CANCELLED')`. */
export async function setCancelled(): Promise<void> {
    await setTaskStatus('CANCELLED');
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

    // The toggle rule lives in planPriorityToggle (unit-tested): it clears the
    // cookie wherever the user typed it and adds one only when there is none.
    const newText = planPriorityToggle(line.text);
    if (newText === undefined) {
        return;
    }

    return applyEditOrReport(
        editor,
        (editBuilder) => {
            editBuilder.replace(line.range, newText);
        },
        'the priority'
    );
}

/**
 * Set the priority of the nearest heading to a value picked from a list, to
 * one typed in full, or to none.
 *
 * The toggle beside this writes `[#A]` and takes it back; the whole range
 * org-mode reads -- `A`..`Z` and `0`..`64`, the same one the extractor parses
 * -- was reachable only by typing the cookie by hand. Cancelling any step
 * leaves the heading alone.
 */
export async function setPriority() {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }

    const line = editor.document.lineAt(headingLine);
    const chosen = await pickPriority(readHeadingPriority(line.text));
    if (!chosen) {
        return;
    }

    const newText = planPrioritySet(line.text, chosen.value);
    if (newText === undefined) {
        return;
    }

    return applyEditOrReport(
        editor,
        (editBuilder) => {
            editBuilder.replace(line.range, newText);
        },
        'the priority'
    );
}

/**
 * What the user chose, or `undefined` when they dismissed a step.
 *
 * The wrapper distinguishes "clear the priority" (`{ value: undefined }`) from
 * "changed their mind" (`undefined`), which a bare `string | undefined` could
 * not.
 */
async function pickPriority(current: string | undefined): Promise<{ value: string | undefined } | undefined> {
    const { strings } = currentUiStrings();
    const picker = strings.priorityPicker;

    const OTHER = Symbol('other');
    const NONE = Symbol('none');
    type PriorityItem = vscode.QuickPickItem & { choice: string | typeof OTHER | typeof NONE };

    const items: PriorityItem[] = PRIORITY_LETTERS.map((letter) =>
        letter === current
            ? { label: letter, description: picker.current, choice: letter }
            : { label: letter, choice: letter }
    );
    // A value already on the heading that the shortlist does not offer -- a
    // number, or a letter further down the alphabet -- is listed too, so the
    // picker always shows what the heading says.
    if (current !== undefined && !PRIORITY_LETTERS.includes(current)) {
        items.unshift({ label: current, description: picker.current, choice: current });
    }
    items.push({ label: picker.other, detail: picker.otherDetail, choice: OTHER });
    items.push({ label: picker.none, choice: NONE });

    const picked = await vscode.window.showQuickPick(items, { title: picker.title });
    if (!picked) {
        return undefined;
    }
    if (picked.choice === NONE) {
        return { value: undefined };
    }
    if (picked.choice !== OTHER) {
        return { value: picked.choice };
    }

    const typed = await vscode.window.showInputBox({
        title: picker.title,
        prompt: picker.prompt,
        placeHolder: picker.placeholder,
        value: current ?? '',
        // Validation runs as the user types, so a rejected value never reaches
        // the document and the message names the range instead of the mistake.
        validateInput: (input) => (parsePriorityValue(input) === undefined ? picker.invalid : undefined)
    });
    if (typed === undefined) {
        return undefined;
    }
    const value = parsePriorityValue(typed);
    return value === undefined ? undefined : { value };
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

    return applyEditOrReport(
        editor,
        (editBuilder) => {
            editBuilder.insert(insertPosition, `${indent}\`CREATED: ${timestamp}\`\n`);
        },
        'the CREATED timestamp'
    );
}

/** Insert a `SCHEDULED:` timestamp; repeating the call removes it (toggle). DEADLINE on the heading is preserved. */
export async function insertScheduledTimestamp() {
    await insertOrReplaceTimestamp('SCHEDULED');
}

/** Insert a `DEADLINE:` timestamp; repeating the call removes it (toggle). SCHEDULED on the heading is preserved. */
export async function insertDeadlineTimestamp() {
    await insertOrReplaceTimestamp('DEADLINE');
}

/**
 * Insert a plain timestamp -- no keyword, `<...>` -- on the heading; repeating
 * the call removes it (toggle). SCHEDULED and DEADLINE are preserved.
 *
 * This is the appointment, as opposed to the two keywords beside it: a date
 * that happens rather than one somebody owes, which is what tells the two
 * apart in the agenda. A recurring appointment is therefore this line plus a
 * repeater (`<2025-09-01 Mon 19:00 +1w>`), while a recurring obligation is
 * `SCHEDULED:` with `++1w`.
 */
export async function insertPlainTimestamp() {
    await insertOrReplaceTimestamp('PLAIN');
}

/** What a timestamp line reads as, for the toggle below and its message. */
type InsertableTimestamp = 'SCHEDULED' | 'DEADLINE' | 'PLAIN';

/** The line to write: the keyword and its colon, or the bare timestamp for PLAIN. */
function timestampLineText(indent: string, type: InsertableTimestamp, timestamp: string): string {
    const body = type === 'PLAIN' ? timestamp : `${type}: ${timestamp}`;
    return `${indent}\`${body}\`\n`;
}

/** How the toggle names what it wrote, or failed to write, in a message to the user. */
function timestampLabel(type: InsertableTimestamp): string {
    return type === 'PLAIN' ? 'the timestamp' : `the ${type} timestamp`;
}

async function insertOrReplaceTimestamp(type: InsertableTimestamp) {
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
        return applyEditOrReport(
            editor,
            (editBuilder) => {
                for (const lineNum of existingLines) {
                    editBuilder.delete(new vscode.Range(lineNum, 0, lineNum + 1, 0));
                }
            },
            timestampLabel(type)
        );
    }

    const indent = getTimestampIndent(editor, headingLine);
    // ADR-0014: SCHEDULED and DEADLINE are active `<...>`; a plain timestamp is
    // written active as well, being a date the agenda is meant to show. Making
    // it inactive is `Toggle Timestamp Active/Inactive` away.
    const timestamp = formatActiveTimestamp(new Date());
    const insertPosition = new vscode.Position(blockEnd, 0);

    return applyEditOrReport(
        editor,
        (editBuilder) => {
            editBuilder.insert(insertPosition, timestampLineText(indent, type, timestamp));
        },
        timestampLabel(type)
    );
}
