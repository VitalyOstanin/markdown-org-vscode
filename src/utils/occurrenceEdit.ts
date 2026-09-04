// Exceptions to a repeating entry: an occurrence that is gone, and one that
// moved. Pure, vscode-free line arithmetic, so the rule is unit-tested against
// arrays of lines; the editor binding lives with the command.
//
// A repeating timestamp describes an endless series and has nowhere to say
// that one of its occurrences is different. The extractor's ADR-0031 answers
// that in the shape iCalendar settled on, written with the `org-properties`
// keys of its ADR-0020:
//
// ````text
// # TODO English                              <- the series, unchanged
// `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`
// ```org-properties
// ID: 9f2c
// EXDATE: 2026-08-13                          <- an occurrence that is gone
// ```
//
// # TODO English                              <- an occurrence that moved
// `SCHEDULED: <2026-08-20 Thu 18:00>`
// ```org-properties
// SERIES_ID: 9f2c
// RECURRENCE_ID: 2026-08-20 15:00
// ```
// ````
//
// The two are not the same operation and are not written the same way. A
// cancelled occurrence is a date added to the series' own `EXDATE`; a moved
// one is an entry of its own that replaces the occurrence it names, and needs
// no `EXDATE` beside it -- that is the split RFC 5545 makes, and the extractor
// reads it that way.
//
// The Android client writes these files too, through the Rust `occurrence`
// module of its own crate. Both clients have to leave the same file behind, so
// every choice below that is not forced by the format -- the replacement at
// the end of the file, the heading copied as it stands, the planning line
// rewritten token by token -- mirrors that module rather than the extension's
// own habits.
import { HEADING_REGEX, headingLevel, matchTimestampLine } from '../orgPatterns';
import { findOrgPropertiesBlocks } from './orgProperties';
import { parseRepeater } from './repeater';
import { getWeekdayName } from './incrementTimestamp';
import { toIsoDate } from './isoDate';

/** Property key listing the occurrences a series does not have. */
export const EXDATE_KEY = 'EXDATE';
/** Property key naming the occurrence an entry replaces. */
export const RECURRENCE_ID_KEY = 'RECURRENCE_ID';
/** Property key naming the series an entry replaces an occurrence of. */
export const SERIES_ID_KEY = 'SERIES_ID';
/** Property key holding an entry's own stable identifier. */
export const ID_KEY = 'ID';

/** The info string of the fenced block these keys are written in. */
const PROPERTIES_INFO = 'org-properties';

/**
 * What the operation could not do, in words meant for a notification.
 *
 * A separate class because every one of these is a refusal to guess at the
 * user's notes -- the caller shows it and writes nothing, rather than
 * reporting a failure of its own.
 */
export class OccurrenceError extends Error {}

/** The file as it now stands, and whether it changed at all. */
export interface OccurrenceEdit {
    lines: string[];
    changed: boolean;
}

/** The key and the value a property line holds (ADR-0020: split on the first colon). */
function propertyLine(line: string): [string, string] | null {
    const at = line.indexOf(':');
    if (at < 0) {
        return null;
    }
    const key = line.slice(0, at).trim();
    if (key === '') {
        return null;
    }
    return [key, line.slice(at + 1).trim()];
}

/** Which line of the section holds `key`, and what it says. The last one wins, as the extractor merges. */
function findProperty(
    lines: readonly string[],
    headingLine: number,
    key: string
): { line: number; value: string } | null {
    let found: { line: number; value: string } | null = null;
    for (const block of findOrgPropertiesBlocks([...lines], headingLine)) {
        for (let i = block.startLine + 1; i < block.endLineExclusive - 1; i++) {
            const hit = propertyLine(lines[i] ?? '');
            if (hit?.[0] === key) {
                found = { line: i, value: hit[1] };
            }
        }
    }
    return found;
}

/** The whitespace a line begins with. */
function indentation(line: string): string {
    return line.slice(0, line.length - line.trimStart().length);
}

/**
 * Write `key` into the property block of the entry at `headingLine`.
 *
 * The line the key is already on is rewritten where there is one; otherwise it
 * joins the last property block the entry has, and an entry with no block gets
 * one under its planning lines -- which is where the extractor's ADR-0020 puts
 * it.
 */
function setProperty(lines: readonly string[], headingLine: number, key: string, value: string): string[] {
    const result = [...lines];
    const written = findProperty(result, headingLine, key);
    if (written) {
        result[written.line] = `${indentation(result[written.line] ?? '')}${key}: ${value}`;
        return result;
    }

    const blocks = findOrgPropertiesBlocks(result, headingLine);
    const last = blocks.at(-1);
    if (last) {
        // Written the way the block's other lines are; a block holding none yet
        // is followed by its closing fence, which carries the block's indent.
        const closing = last.endLineExclusive - 1;
        const sample = Math.min(last.startLine + 1, closing);
        result.splice(closing, 0, `${indentation(result[sample] ?? '')}${key}: ${value}`);
        return result;
    }

    let at = headingLine + 1;
    while (at < result.length && matchTimestampLine(result[at] ?? '')) {
        at++;
    }
    result.splice(at, 0, `\`\`\`${PROPERTIES_INFO}`, `${key}: ${value}`, '```');
    return result;
}

/** The one planning line of the entry that repeats, and the timestamp on it. */
interface RepeatingLine {
    line: number;
    /** Half-open character range of the timestamp within the line, brackets included. */
    span: { start: number; end: number };
}

/**
 * The one planning line of the entry that repeats.
 *
 * An entry that does not repeat has no occurrences to make an exception to:
 * what the caller means by cancelling it is the keyword, and what it means by
 * moving it is the planning date, and both have operations of their own.
 *
 * An entry repeating on two dates at once -- a `SCHEDULED` and a `DEADLINE`
 * that both carry a repeater -- is refused rather than guessed at: which of
 * the two the occurrence is counted by decides what the replacement carries,
 * and a wrong guess writes a wrong date into the user's notes.
 */
export function findRepeatingLine(lines: readonly string[], headingLine: number, heading: string): RepeatingLine {
    const repeating: RepeatingLine[] = [];
    for (let i = headingLine + 1; i < lines.length; i++) {
        const text = lines[i] ?? '';
        const hit = matchTimestampLine(text);
        if (!hit) {
            break;
        }
        const start = text.indexOf(hit.timestamp);
        const span = { start, end: start + hit.timestamp.length };
        if (fields(text, span).some((field) => isRepeater(text.slice(field.start, field.end)))) {
            repeating.push({ line: i, span });
        }
    }

    const first = repeating[0];
    if (!first) {
        throw new OccurrenceError(`${heading} does not repeat, and an entry that does not repeat has no occurrences`);
    }
    if (repeating.length > 1) {
        throw new OccurrenceError(
            `${heading} repeats on more than one date, and which one an occurrence is counted by is left to be decided by hand`
        );
    }
    return first;
}

/** A whitespace-separated token of a timestamp, as a range into the line it was read from. */
interface Field {
    start: number;
    end: number;
}

/** The tokens between the timestamp's brackets, as ranges into `line`. */
function fields(line: string, span: { start: number; end: number }): Field[] {
    const found: Field[] = [];
    const end = span.end - 1;
    let at = span.start + 1;
    while (at < end) {
        const text = line.slice(at, end);
        const offset = text.search(/\S/);
        if (offset < 0) {
            break;
        }
        const from = at + offset;
        const rest = line.slice(from, end);
        const width = rest.search(/\s/);
        const to = width < 0 ? end : from + width;
        found.push({ start: from, end: to });
        at = to;
    }
    return found;
}

/** Whether the token is a clock time, or a range of two of them. */
function isTime(field: string): boolean {
    const halves = field.split('-');
    if (halves.length > 2) {
        return false;
    }
    return halves.every((half) => /^\d{2}:\d{2}$/.test(half));
}

/** Whether the token is a repeater, as the extractor reads one. */
function isRepeater(field: string): boolean {
    return parseRepeater(field) !== null;
}

/** Replace `[start, end)` of `text` with `to`. */
function splice(text: string, range: Field, to: string): string {
    return text.slice(0, range.start) + to + text.slice(range.end);
}

/** The time the timestamp carries, as written; a range names its occurrence by where it starts. */
function writtenTime(line: string, span: { start: number; end: number }): string | null {
    for (const field of fields(line, span)) {
        const token = line.slice(field.start, field.end);
        if (isTime(token)) {
            return token.split('-')[0] ?? null;
        }
    }
    return null;
}

/**
 * The series' planning line, moved to the occurrence that replaces it.
 *
 * The line is the series' own, rewritten token by token rather than composed
 * from nothing: the keyword, the indentation, the inline-code framing and the
 * language of the weekday are all the file's, and a replacement spelled
 * differently from the entry it stands in for would be a change the user did
 * not ask for.
 *
 * The repeater is the one token that goes: the replacement is one occurrence
 * and does not repeat. A warning cookie stays -- a deadline moved is still a
 * deadline warned about the same number of days ahead.
 */
function replacementLine(line: string, span: { start: number; end: number }, date: Date, time: string | null): string {
    const found = fields(line, span);
    const dateField = found[0];
    if (!dateField) {
        throw new OccurrenceError(`${line.trim()} carries no date to move`);
    }
    const edits: [Field, string][] = [[dateField, toIsoDate(date)]];

    const second = found[1];
    const weekday = second && /^[А-Яа-яA-Za-z]+$/.test(line.slice(second.start, second.end)) ? second : null;
    if (weekday) {
        const written = line.slice(weekday.start, weekday.end);
        const name = getWeekdayName(date, written);
        // A file that spells its weekdays in lowercase keeps doing so.
        edits.push([weekday, written === written.toLowerCase() ? name.toLowerCase() : name]);
    }

    const repeater = found.findIndex((field) => isRepeater(line.slice(field.start, field.end)));
    if (repeater >= 0) {
        // The whitespace ahead of the token goes with it: taken on its own it
        // would leave two spaces where there was one. A repeater standing first
        // is not one -- the date is -- so there is always a token before it.
        const before = found[repeater - 1];
        const token = found[repeater];
        if (token) {
            edits.push([{ start: before ? before.end : token.start, end: token.end }, '']);
        }
    }

    if (time !== null) {
        const written = found.find((field) => isTime(line.slice(field.start, field.end)));
        if (written) {
            edits.push([written, time]);
        } else {
            // Where the timestamp had no time, it goes after the weekday, or
            // after the date where there is no weekday.
            const after = (weekday ?? dateField).end;
            edits.push([{ start: after, end: after }, ` ${time}`]);
        }
    }

    // Applied from the end, so that a replacement of a different width cannot
    // move the range the next one was located by.
    edits.sort((a, b) => b[0].start - a[0].start);
    let rewritten = line;
    for (const [range, to] of edits) {
        rewritten = splice(rewritten, range, to);
    }
    return rewritten;
}

/** What a heading says, for a message about it: the line without its hashes and keyword markup. */
function headingTitle(line: string): string {
    const match = HEADING_REGEX.exec(line);
    return (match?.groups?.title ?? line).trim();
}

/**
 * Take one occurrence out of a repeating entry.
 *
 * The date joins the entry's `EXDATE`, which is written into its property
 * block -- created under the planning lines when the entry has none. The
 * series itself is not touched: it goes on repeating, and the agenda leaves
 * out the one day.
 *
 * Cancelling a date the series does not fall on is not refused. Whether a
 * given date is an occurrence is the repeater's answer, and the caller is the
 * agenda, which asks about a day it drew the series on; a date that is not one
 * leaves an `EXDATE` that suppresses nothing.
 */
export function cancelOccurrence(
    lines: readonly string[],
    headingLine: number,
    heading: string,
    date: Date
): OccurrenceEdit {
    findRepeatingLine(lines, headingLine, heading);

    const written = findProperty(lines, headingLine, EXDATE_KEY);
    const dates = (written?.value ?? '').split(/[,\s]+/).filter((field) => field !== '');
    const text = toIsoDate(date);
    if (dates.includes(text)) {
        return { lines: [...lines], changed: false };
    }
    dates.push(text);

    return { lines: setProperty(lines, headingLine, EXDATE_KEY, dates.join(', ')), changed: true };
}

/** Whether the file already holds an entry replacing `date` of `series`. */
function alreadyReplaced(lines: readonly string[], series: string, date: string): boolean {
    for (let i = 0; i < lines.length; i++) {
        if (headingLevel(lines[i] ?? '') === null) {
            continue;
        }
        const named = findProperty(lines, i, SERIES_ID_KEY)?.value === series;
        const replaced = findProperty(lines, i, RECURRENCE_ID_KEY)?.value.split(/\s+/)[0];
        if (named && replaced === date) {
            return true;
        }
    }
    return false;
}

/**
 * Move one occurrence of a repeating entry to another date, another time, or
 * both.
 *
 * The series stays as it is, save for gaining an `ID` when it has none: what
 * is written is a second entry at the end of the same file, spelled the way
 * the series is and carrying the pair that says which occurrence it stands in
 * for. The occurrence it replaces is then not drawn from the series, so
 * nothing has to be excluded as well.
 *
 * `time` is `HH:MM` and `null` keeps whatever time the series carries -- an
 * occurrence moved to another day is usually held at the same hour.
 * `seriesId` is the identifier to give the series when it does not already
 * have one, and is ignored when it does; it comes from the caller for the
 * reason today does, so that the same call writes the same file.
 */
export function moveOccurrence(
    lines: readonly string[],
    headingLine: number,
    occurrence: Date,
    to: Date,
    time: string | null,
    seriesId: string
): OccurrenceEdit {
    const headingText = lines[headingLine] ?? '';
    const repeating = findRepeatingLine(lines, headingLine, headingTitle(headingText));

    const known = findProperty(lines, headingLine, ID_KEY)?.value;
    const identifier = known !== undefined && known !== '' ? known : seriesId;

    const replaced = toIsoDate(occurrence);
    if (alreadyReplaced(lines, identifier, replaced)) {
        throw new OccurrenceError(
            `${replaced} of ${headingTitle(headingText)} is already replaced by an entry of this file, which is the one to edit`
        );
    }

    const planning = lines[repeating.line] ?? '';
    const moved = replacementLine(planning, repeating.span, to, time);
    const held = writtenTime(planning, repeating.span);
    const recurrence = held === null ? replaced : `${replaced} ${held}`;

    const result =
        known !== undefined && known !== '' ? [...lines] : setProperty(lines, headingLine, ID_KEY, identifier);

    // A blank line between the entry and what stands above it, and none where
    // the file already ends in one: the separator belongs between two entries,
    // and one added on every write would open a gap that grows by a line per
    // occurrence moved. The replacement goes at the end of the file, which is
    // what two devices can both write without a conflict.
    if (result.length > 0 && (result.at(-1) ?? '').trim() !== '') {
        result.push('');
    }
    result.push(
        headingText,
        moved,
        `\`\`\`${PROPERTIES_INFO}`,
        `${SERIES_ID_KEY}: ${identifier}`,
        `${RECURRENCE_ID_KEY}: ${recurrence}`,
        '```'
    );

    return { lines: result, changed: true };
}

/** The half-open line range that changed, and what stands there now. */
export interface ReplacedRange {
    startLine: number;
    endLineExclusive: number;
    lines: string[];
}

/**
 * The one range `before` and `after` differ over, matched from both ends.
 *
 * The operations here touch a property line and the end of the file, and an
 * edit spanning the two is still narrower than rewriting the document: the
 * lines above the first change keep their positions, so a cursor and a fold
 * above the entry survive the write. `null` where the two are the same.
 */
export function replacedRange(before: readonly string[], after: readonly string[]): ReplacedRange | null {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) {
        start++;
    }
    if (start === before.length && start === after.length) {
        return null;
    }

    let tail = 0;
    while (
        tail < before.length - start &&
        tail < after.length - start &&
        before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) {
        tail++;
    }

    return {
        startLine: start,
        endLineExclusive: before.length - tail,
        lines: after.slice(start, after.length - tail)
    };
}
