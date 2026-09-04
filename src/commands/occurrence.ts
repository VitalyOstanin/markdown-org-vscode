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
 * from the editor has no day at all until one is typed. What the box holds
 * when it opens is that day, so confirming is a keypress.
 */
import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { findNearestHeading, requireActiveEditor } from '../utils';
import { applyEditOrReport } from '../utils/applyEdit';
import { queueEdit } from '../utils/editQueue';
import { isIsoDate, toIsoDate } from '../utils/isoDate';
import { formatError, notifyStatus, notifyWarn } from '../utils/notify';
import { OccurrenceError, cancelOccurrence, moveOccurrence, replacedRange } from '../utils/occurrenceEdit';

/** `HH:MM`, or `HH:MM-HH:MM` for an occurrence held between two times. */
const TIME_INPUT = /^\d{2}:\d{2}(-\d{2}:\d{2})?$/;

/** The day an entry's exception is about, asked for with `preset` already filled in. */
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
    const [year, month, day] = answer
        .trim()
        .split('-')
        .map((part) => parseInt(part, 10));
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

/**
 * The hour the occurrence moves to, or `null` to keep the series' own.
 *
 * An empty box is that second answer rather than a cancelled command: moving
 * an occurrence to another day at the same hour is the common case, and it
 * would be tiresome to retype the hour to get it. Escape cancels, and is told
 * apart from an empty box by `undefined`.
 */
async function askTime(): Promise<{ time: string | null } | null> {
    const answer = await vscode.window.showInputBox({
        title: 'Move the occurrence to which time?',
        prompt: 'HH:MM, or empty to keep the hour the series is held at',
        validateInput: (value) =>
            value.trim() === '' || TIME_INPUT.test(value.trim()) ? null : 'A time is written HH:MM'
    });
    if (answer === undefined) {
        return null;
    }
    const time = answer.trim();
    return { time: time === '' ? null : time };
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
 * document's own line ending.
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
    const text = change.lines.join(eol) + (endsDocument ? '' : eol);

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
 * and the box opens on the day the series is planned for.
 */
export async function cancelOccurrenceCommand(day?: string): Promise<void> {
    const entry = await entryAtCursor();
    if (!entry) {
        return;
    }
    const drawn = day !== undefined && isIsoDate(day) ? day : plannedDay(entry.lines, entry.headingLine);
    const date = await askDay('Cancel which occurrence?', drawn);
    if (!date) {
        return;
    }

    await queueEdit(async () => {
        try {
            const edit = cancelOccurrence(
                entry.lines,
                entry.headingLine,
                heading(entry.lines, entry.headingLine),
                date
            );
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

/** Move one occurrence of the repeating entry at the cursor to another day, another time, or both. */
export async function moveOccurrenceCommand(day?: string): Promise<void> {
    const entry = await entryAtCursor();
    if (!entry) {
        return;
    }
    const planned = day !== undefined && isIsoDate(day) ? day : plannedDay(entry.lines, entry.headingLine);
    const occurrence = await askDay('Move which occurrence?', planned);
    if (!occurrence) {
        return;
    }
    const to = await askDay('Move the occurrence to which day?', toIsoDate(occurrence));
    if (!to) {
        return;
    }
    const time = await askTime();
    if (!time) {
        return;
    }

    await queueEdit(async () => {
        try {
            const edit = moveOccurrence(entry.lines, entry.headingLine, occurrence, to, time.time, randomUUID());
            await write(entry.editor, entry.lines, edit.lines, 'the moved occurrence');
        } catch (error) {
            report(error);
        }
    });
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

/** The day the entry is planned for, which is the day the box opens on. */
function plannedDay(lines: readonly string[], headingLine: number): string {
    for (let i = headingLine + 1; i < lines.length; i++) {
        const found = /\d{4}-\d{2}-\d{2}/.exec(lines[i] ?? '');
        if (found) {
            return found[0];
        }
        if ((lines[i] ?? '').trim() === '') {
            break;
        }
    }
    return toIsoDate(new Date());
}
