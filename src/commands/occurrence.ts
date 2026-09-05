/**
 * The two exceptions a repeating entry can carry, as commands.
 *
 * A series drawn on a day the user did not want it on has two answers, and
 * they are not the same: the occurrence is gone, or it moved. Both are written
 * into the notes by `utils/occurrenceEdit`, which follows the extractor's
 * ADR-0031 and the Android client's module of the same name; this file is the
 * editor around them -- which entry, which day, and the write itself.
 *
 * The day is asked for rather than assumed even where the caller names one:
 * the agenda hands over the day the row was drawn on, and an entry acted on
 * from the editor has no day at all until one is chosen. It is chosen from
 * the days the series actually falls on rather than typed, because that is
 * how the reader knows it -- "the next one", "the one after that" -- and
 * because a date typed from memory is how an exception lands on a day the
 * series was never on.
 *
 * Where the occurrence moves to is answered in the notes instead of in a box:
 * the command writes a draft line under the series (`utils/occurrenceDraft`)
 * and the date is walked with the same Shift+Up and Shift+Down that walk any
 * other timestamp. Confirming turns the draft into the replacement; cancelling
 * takes the line back out.
 */
import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { HEADING_REGEX } from '../orgPatterns';
import { findNearestHeading, requireActiveEditor } from '../utils';
import { applyEditOrReport } from '../utils/applyEdit';
import { queueEdit } from '../utils/editQueue';
import { isIsoDate, toIsoDate } from '../utils/isoDate';
import { formatError, notifyStatus, notifyWarn } from '../utils/notify';
import { draftDayColumn, matchOccurrenceDraft, occurrenceDraftLine } from '../utils/occurrenceDraft';
import {
    OccurrenceError,
    cancelOccurrence,
    listOccurrences,
    moveOccurrence,
    planningLineOf,
    replacedRange,
    seriesWeekday,
    type SeriesOccurrence
} from '../utils/occurrenceEdit';

/** How many of the days ahead the picker offers before the reader has to name one. */
const OFFERED = 8;

/** A day typed rather than picked, for the occurrence that is further off than the list reaches. */
const ANOTHER_DAY = Symbol('another day');

/** The day an entry's exception is about, typed out. */
async function askDay(prompt: string, preset: string): Promise<Date | null> {
    const answer = await vscode.window.showInputBox({
        title: prompt,
        value: preset,
        valueSelection: [0, preset.length],
        prompt: 'YYYY-MM-DD',
        validateInput: (value) => (isIsoDate(value.trim()) ? null : 'A day is written YYYY-MM-DD')
    });
    if (answer === undefined) {
        return null;
    }
    return fromIsoDate(answer.trim());
}

/** `YYYY-MM-DD` as a local date. */
function fromIsoDate(text: string): Date {
    const [year, month, day] = text.split('-').map((part) => parseInt(part, 10));
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

/** One row of the picker: a day of the series, or the invitation to type one. */
interface DayItem extends vscode.QuickPickItem {
    day: string | typeof ANOTHER_DAY;
}

/** What the picker says about a day the series has already lost. */
function standing(occurrence: SeriesOccurrence): string {
    if (occurrence.cancelled) {
        return 'cancelled';
    }
    if (occurrence.moved) {
        return 'already moved';
    }
    return '';
}

/**
 * The occurrence the exception is about, chosen from the days the series
 * falls on.
 *
 * `named` is the day the agenda drew the row on. It leads the list even when
 * it is behind today -- the row the reader pressed is the one they mean --
 * and the days ahead follow it.
 */
async function pickOccurrence(
    title: string,
    lines: readonly string[],
    headingLine: number,
    heading: string,
    named: string | undefined
): Promise<Date | null> {
    let ahead: SeriesOccurrence[];
    try {
        ahead = listOccurrences(lines, headingLine, heading, new Date(), OFFERED);
    } catch (error) {
        report(error);
        return null;
    }

    const days =
        named !== undefined && !ahead.some((day) => day.day === named)
            ? [{ day: named, time: ahead[0]?.time ?? null, cancelled: false, moved: false }, ...ahead]
            : ahead;
    const items: DayItem[] = days.map((occurrence) => ({
        label: occurrence.time === null ? occurrence.day : `${occurrence.day} ${occurrence.time}`,
        description: standing(occurrence),
        day: occurrence.day
    }));
    items.push({ label: 'Another day…', description: 'type a date the list does not reach', day: ANOTHER_DAY });

    const chosen = await vscode.window.showQuickPick(items, {
        title,
        placeHolder: named ?? items[0]?.label ?? '',
        matchOnDescription: true
    });
    if (!chosen) {
        return null;
    }
    if (chosen.day === ANOTHER_DAY) {
        return askDay(title, named ?? ahead[0]?.day ?? toIsoDate(new Date()));
    }
    return fromIsoDate(chosen.day);
}

/** The entry the command acts on, and the file as an array of lines. */
async function entryAtCursor(): Promise<{ editor: vscode.TextEditor; headingLine: number; lines: string[] } | null> {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        return null;
    }
    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return null;
    }
    return { editor, headingLine, lines: editor.document.getText().split(/\r?\n/) };
}

/**
 * Write `after` over the document, as the one range the two differ over.
 *
 * A file whose last line is not empty gains no trailing newline here: the
 * range ends where the document does, and the replacement is joined with the
 * document's own line ending. A range that stands for lines removed and none
 * added is written with nothing at all, so the line ending goes with the line.
 */
async function write(editor: vscode.TextEditor, before: string[], after: string[], what: string): Promise<boolean> {
    const change = replacedRange(before, after);
    if (!change) {
        return false;
    }
    const eol = editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const last = editor.document.lineCount - 1;
    const endsDocument = change.endLineExclusive > last;
    const range = endsDocument
        ? new vscode.Range(change.startLine, 0, last, editor.document.lineAt(last).text.length)
        : new vscode.Range(change.startLine, 0, change.endLineExclusive, 0);
    // Lines taken away and nothing put back -- discarding a draft -- is the one
    // case where the replacement is empty, and there the closing line ending
    // belongs to the range rather than to the text: appending one would leave
    // a blank line where the removed line stood.
    const text = change.lines.length === 0 ? '' : change.lines.join(eol) + (endsDocument ? '' : eol);

    return applyEditOrReport(
        editor,
        (builder) => {
            builder.replace(range, text);
        },
        what
    );
}

/**
 * Take one occurrence out of the repeating entry at the cursor.
 *
 * `day` is the day the agenda drew the row on; from the palette there is none
 * and the list opens on the next occurrence ahead.
 */
export async function cancelOccurrenceCommand(day?: string): Promise<void> {
    const entry = await entryAtCursor();
    if (!entry) {
        return;
    }
    const named = day !== undefined && isIsoDate(day) ? day : undefined;
    const title = heading(entry.lines, entry.headingLine);
    const date = await pickOccurrence('Cancel which occurrence?', entry.lines, entry.headingLine, title, named);
    if (!date) {
        return;
    }

    await queueEdit(async () => {
        try {
            const edit = cancelOccurrence(entry.lines, entry.headingLine, title, date);
            if (!edit.changed) {
                notifyStatus(`${toIsoDate(date)} is already left out of the series`);
                return;
            }
            await write(entry.editor, entry.lines, edit.lines, 'the cancelled occurrence');
        } catch (error) {
            report(error);
        }
    });
}

/**
 * Offer to move one occurrence of the repeating entry at the cursor.
 *
 * The command ends with a draft line under the series rather than with the
 * move itself: the day it proposes is the occurrence's own, and it is walked
 * from there with Shift+Up and Shift+Down. `confirmOccurrenceMoveCommand`
 * writes what the draft ends up saying.
 */
export async function moveOccurrenceCommand(day?: string): Promise<void> {
    const entry = await entryAtCursor();
    if (!entry) {
        return;
    }
    const named = day !== undefined && isIsoDate(day) ? day : undefined;
    const title = heading(entry.lines, entry.headingLine);

    const standing = findDraft(entry.lines);
    if (standing !== null) {
        notifyStatus('A move is already drafted; confirm or cancel it first');
        moveCaretTo(entry.editor, standing);
        return;
    }

    const occurrence = await pickOccurrence('Move which occurrence?', entry.lines, entry.headingLine, title, named);
    if (!occurrence) {
        return;
    }

    await queueEdit(async () => {
        try {
            const planning = planningLineOf(entry.lines, entry.headingLine, title);
            const listed = listOccurrences(entry.lines, entry.headingLine, title, occurrence, 1)[0];
            const line = entry.lines[planning] ?? '';
            const draft = occurrenceDraftLine(
                line.slice(0, line.length - line.trimStart().length),
                toIsoDate(occurrence),
                occurrence,
                listed?.time ?? null,
                seriesWeekday(entry.lines, entry.headingLine, title)
            );
            const written = await applyEditOrReport(
                entry.editor,
                (builder) => {
                    builder.insert(new vscode.Position(planning + 1, 0), `${draft}\n`);
                },
                'the draft of the move'
            );
            if (written) {
                moveCaretTo(entry.editor, planning + 1);
                notifyStatus('Walk the date with Shift+Up and Shift+Down, then Ctrl+Enter to move it');
            }
        } catch (error) {
            report(error);
        }
    });
}

/** Turn the draft standing in the document into the replacement it describes. */
export async function confirmOccurrenceMoveCommand(): Promise<void> {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        return;
    }
    const lines = editor.document.getText().split(/\r?\n/);
    const at = findDraft(lines);
    if (at === null) {
        notifyStatus('No move is drafted here');
        return;
    }
    const draft = matchOccurrenceDraft(lines[at] ?? '');
    if (!draft) {
        return;
    }
    const headingLine = headingAbove(lines, at);
    if (headingLine === null) {
        notifyWarn('The draft stands under no entry');
        return;
    }

    await queueEdit(async () => {
        try {
            const without = [...lines];
            without.splice(at, 1);
            const edit = moveOccurrence(
                without,
                headingLine,
                fromIsoDate(draft.from),
                fromIsoDate(draft.to),
                draft.time,
                randomUUID()
            );
            await write(editor, lines, edit.lines, 'the moved occurrence');
        } catch (error) {
            report(error);
        }
    });
}

/** Take the draft back out, leaving the series as it was. */
export async function cancelOccurrenceMoveCommand(): Promise<void> {
    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        return;
    }
    const lines = editor.document.getText().split(/\r?\n/);
    const at = findDraft(lines);
    if (at === null) {
        return;
    }

    await queueEdit(async () => {
        const without = [...lines];
        without.splice(at, 1);
        await write(editor, lines, without, 'the cancelled draft');
    });
}

/** Which line the draft stands on, or `null` where the document holds none. */
export function findDraft(lines: readonly string[]): number | null {
    for (let i = 0; i < lines.length; i++) {
        if (matchOccurrenceDraft(lines[i] ?? '')) {
            return i;
        }
    }
    return null;
}

/** The heading the line at `at` belongs to. */
function headingAbove(lines: readonly string[], at: number): number | null {
    for (let i = at; i >= 0; i--) {
        if (HEADING_REGEX.test(lines[i] ?? '')) {
            return i;
        }
    }
    return null;
}

/** Put the caret on the day of the draft, which is the field the arrows start on. */
function moveCaretTo(editor: vscode.TextEditor, line: number): void {
    const text = editor.document.lineAt(Math.min(line, editor.document.lineCount - 1)).text;
    const at = new vscode.Position(line, draftDayColumn(text));
    editor.selection = new vscode.Selection(at, at);
    editor.revealRange(new vscode.Range(at, at));
}

/** What a refusal says. A refusal to guess at the notes is a warning, not a failure. */
function report(error: unknown): void {
    if (error instanceof OccurrenceError) {
        notifyWarn(error.message);
        return;
    }
    notifyWarn(`The occurrence was not written: ${formatError(error)}`);
}

/** The heading text the messages name the entry by. */
function heading(lines: readonly string[], headingLine: number): string {
    return (lines[headingLine] ?? '').replace(/^#+\s*/, '').trim();
}
