// Exceptions to a repeating entry: an occurrence that is gone, and one that
// moved. Pure, vscode-free line arithmetic, so the rule is unit-tested against
// arrays of lines; the editor binding lives with the command.
//
// A repeating timestamp describes an endless series and has nowhere to say
// that one of its occurrences is different. Both answers are written into the
// entry itself, with the `org-properties` keys of the extractor's ADR-0020 and
// the `MOVED` line of its ADR-0038:
//
// ````text
// # TODO English
// `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`
// `MOVED: 2026-08-20 -> <2026-08-22 Sat 18:00>`   <- an occurrence that moved
// ```org-properties
// EXDATE: 2026-08-13                              <- an occurrence that is gone
// ```
// ````
//
// The two are not the same operation and are not written the same way. A
// cancelled occurrence is a date added to the series' own `EXDATE`; a moved one
// is a line naming the day it left and the timestamp it is held on instead, and
// needs no `EXDATE` beside it -- an occurrence that moved is not one that is
// gone, and the extractor reads it that way.
//
// The shape ADR-0031 wrote a move in -- a second entry carrying `SERIES_ID` and
// `RECURRENCE_ID` -- is still read, because files and other tools hold it. An
// occurrence standing in such an entry is moved where it stands rather than
// answered with a `MOVED` line here, so that only one of the two ever speaks
// for a day.
//
// The Android client writes these files too, through the Rust `occurrence`
// module of its own crate. Both clients have to leave the same file behind, so
// every choice below that is not forced by the format -- where the line is
// written, the weekday spelt as the series spells it, the planning line
// rewritten token by token -- mirrors that module rather than the extension's
// own habits.
import { headingLevel, headingTitle, isWeekdayName, matchTimestampLine, type TimestampLineMatch } from '../orgPatterns';
import { matchMovedLine, movedLine, weekdaySample, type MovedLineFields } from './movedLine';
import { findOrgProperty, indentation, setOrgProperty } from './orgProperties';
import { addMonths, nextOccurrence, parseRepeater, type Repeater } from './repeater';
import { getWeekdayName } from './incrementTimestamp';
import { fromIsoDate, isIsoDate, toIsoDate } from './isoDate';

/** Property key listing the occurrences a series does not have. */
export const EXDATE_KEY = 'EXDATE';
/** Property key naming the occurrence an entry replaces. */
export const RECURRENCE_ID_KEY = 'RECURRENCE_ID';
/** Property key naming the series an entry replaces an occurrence of. */
export const SERIES_ID_KEY = 'SERIES_ID';
/** Property key holding an entry's own stable identifier. */
export const ID_KEY = 'ID';

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

/** The one planning line of the entry that repeats, and the timestamp on it. */
interface RepeatingLine {
    line: number;
    /** Half-open character range of the timestamp within the line, brackets included. */
    span: { start: number; end: number };
}

/**
 * Whether the line plans the entry for a day, rather than recording one.
 *
 * `CREATED` and `CLOSED` are stamps of what happened and are written
 * inactive; a series is kept on a `SCHEDULED`, a `DEADLINE`, or a bare active
 * timestamp, and those are the three a repeater can stand in.
 */
function plans(hit: TimestampLineMatch): boolean {
    return hit.type === 'SCHEDULED' || hit.type === 'DEADLINE' || (hit.type === 'PLAIN' && hit.active);
}

/**
 * Every planning line of the entry at `headingLine`, in the order they stand.
 *
 * A line the format does not name is passed over instead of ending the walk:
 * a keyword typed without its colon is a line like that, and stopping there
 * hid a `SCHEDULED` that was in plain sight two lines down.
 */
function planningLines(lines: readonly string[], headingLine: number): RepeatingLine[] {
    const found: RepeatingLine[] = [];
    for (let i = headingLine + 1; i < lines.length; i++) {
        const text = lines[i] ?? '';
        if (headingLevel(text) !== null) {
            break;
        }
        const hit = matchTimestampLine(text);
        if (!hit || !plans(hit)) {
            continue;
        }
        const start = text.indexOf(hit.timestamp);
        found.push({ line: i, span: { start, end: start + hit.timestamp.length } });
    }
    return found;
}

/**
 * The one planning line of the entry that repeats.
 *
 * An entry that does not repeat has no occurrences to make an exception to:
 * what the caller means by cancelling it is the keyword, and what it means by
 * moving it is the planning date, and both have operations of their own.
 *
 * The whole entry is read rather than the run of lines directly under the
 * heading. A planning line is commonly not the first of them -- `CREATED`
 * stands above it, a property block below -- and a line the format does not
 * name is passed over instead of ending the search: a keyword typed without
 * its colon is a line like that, and stopping there hid a `SCHEDULED` that
 * was in plain sight two lines down and reported the entry as one that does
 * not repeat.
 *
 * An entry repeating on two dates at once -- a `SCHEDULED` and a `DEADLINE`
 * that both carry a repeater -- is refused rather than guessed at: which of
 * the two the occurrence is counted by decides what the replacement carries,
 * and a wrong guess writes a wrong date into the user's notes.
 */
export function findRepeatingLine(lines: readonly string[], headingLine: number, heading: string): RepeatingLine {
    const planning = planningLines(lines, headingLine);
    const repeating = planning.filter((found) =>
        fields(lines[found.line] ?? '', found.span).some((field) =>
            isRepeater((lines[found.line] ?? '').slice(field.start, field.end))
        )
    );

    const first = repeating[0];
    if (!first) {
        // Told apart, because the two are answered differently: an entry with
        // no planning line at all is usually one whose keyword is misspelled
        // or whose date was never written, and saying it does not repeat
        // sends the reader looking for a repeater that is already there.
        throw new OccurrenceError(
            planning.length === 0
                ? `${heading} carries no planning line the format names, so it has no occurrences; a planning line is written \`SCHEDULED: <YYYY-MM-DD>\``
                : `${heading} does not repeat, and an entry that does not repeat has no occurrences`
        );
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

/**
 * The time the timestamp carries, as written -- a range of hours included.
 *
 * An occurrence held from 15:00 to 16:00 is held for an hour wherever it
 * moves to, so the whole token travels with it rather than only its start.
 */
function writtenTime(line: string, span: { start: number; end: number }): string | null {
    for (const field of fields(line, span)) {
        const token = line.slice(field.start, field.end);
        if (isTime(token)) {
            return token;
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
    const weekday = second && isWeekdayName(line.slice(second.start, second.end)) ? second : null;
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

    const written = findOrgProperty(lines, headingLine, EXDATE_KEY);
    const dates = (written?.value ?? '').split(/[,\s]+/).filter((field) => field !== '');
    const text = toIsoDate(date);
    if (dates.includes(text)) {
        return { lines: [...lines], changed: false };
    }
    dates.push(text);

    return { lines: setOrgProperty(lines, headingLine, EXDATE_KEY, dates.join(', ')), changed: true };
}

/** The entry of the file that already stands in for one occurrence of a series. */
export interface StandingReplacement {
    /** Which line the replacing entry's heading is on. */
    headingLine: number;
    /** The day it now falls on, as `YYYY-MM-DD`. */
    day: string;
    /** The hour it is held at, as its timestamp writes it, or `null`. */
    time: string | null;
}

/**
 * The entry replacing `date` of `series`, or `null` where none does.
 *
 * The whole file is walked rather than the lines under the series: a
 * replacement is written at the end of the file, and one made months ago is
 * separated from the series it belongs to by everything written since.
 */
function findReplacement(lines: readonly string[], series: string, date: string): StandingReplacement | null {
    return replacementsOf(lines, series).get(date) ?? null;
}

/**
 * Every entry of the file standing in for an occurrence of `series`, by the
 * day it replaces.
 *
 * Built in one pass because the callers ask about several days at once: the
 * list of days a command offers asks about eight, and a walk of the whole
 * file per day is that walk eight times over. `RECURRENCE_ID` is read only
 * where `SERIES_ID` already named this series, which is what most headings
 * fail on.
 */
function replacementsOf(lines: readonly string[], series: string): Map<string, StandingReplacement> {
    const found = new Map<string, StandingReplacement>();
    if (series === '') {
        return found;
    }
    for (let i = 0; i < lines.length; i++) {
        if (headingLevel(lines[i] ?? '') === null) {
            continue;
        }
        if (findOrgProperty(lines, i, SERIES_ID_KEY)?.value !== series) {
            continue;
        }
        const replaced = findOrgProperty(lines, i, RECURRENCE_ID_KEY)?.value.split(/\s+/)[0];
        // The first entry replacing a day is the one that stands, the way the
        // first `MOVED` line naming an occurrence does.
        if (replaced === undefined || found.has(replaced)) {
            continue;
        }
        const planning = planningLines(lines, i)[0];
        const line = planning ? (lines[planning.line] ?? '') : '';
        const written = planning ? fields(line, planning.span)[0] : undefined;

        found.set(replaced, {
            headingLine: i,
            day: written ? line.slice(written.start, written.end) : replaced,
            time: planning ? writtenTime(line, planning.span) : null
        });
    }
    return found;
}

/**
 * Where the occurrence of `occurrence` now stands, for a caller about to
 * offer to move it again.
 *
 * An occurrence moved once is moved from where it went, not from where the
 * series draws it: the day the reader is answering about is the one already
 * written into the notes.
 */
export function replacementOf(
    lines: readonly string[],
    headingLine: number,
    occurrence: Date
): StandingReplacement | null {
    const day = toIsoDate(occurrence);
    const moved = movedOccurrences(lines, headingLine).find((held) => held.from === day);
    if (moved) {
        return { headingLine, day: moved.to, time: moved.time };
    }
    return findReplacement(lines, findOrgProperty(lines, headingLine, ID_KEY)?.value ?? '', day);
}

/**
 * Move one occurrence of a repeating entry to another date, another time, or
 * both.
 *
 * What is written is a `MOVED` line of the series itself, under its planning
 * line (the extractor's ADR-0038): the day before the arrow names the
 * occurrence, and the timestamp after it is where the occurrence is held. The
 * series goes on repeating and needs no `EXDATE` beside it -- an occurrence
 * that moved is not one that is gone.
 *
 * An occurrence moved a second time rewrites the line already standing for it
 * rather than gaining another: two lines naming the same occurrence are a file
 * with no answer for which of the two days it is on, and the reader of these
 * notes -- this extension, the Android client, the core -- would each have to
 * invent one.
 *
 * `time` is `HH:MM` and `null` keeps whatever time the series carries -- an
 * occurrence moved to another day is usually held at the same hour.
 */
export function moveOccurrence(
    lines: readonly string[],
    headingLine: number,
    occurrence: Date,
    to: Date,
    time: string | null
): OccurrenceEdit {
    const headingText = lines[headingLine] ?? '';
    const heading = headingTitle(headingText);
    const repeating = findRepeatingLine(lines, headingLine, heading);

    const planning = lines[repeating.line] ?? '';
    const held = time ?? writtenTime(planning, repeating.span);
    const spelling = seriesWeekday(lines, headingLine, heading) ?? weekdaySample(lines);
    const written = movedLine(indentation(planning), occurrence, to, held, spelling);

    const standing = findMovedLine(lines, headingLine, toIsoDate(occurrence));
    if (standing !== null) {
        if ((lines[standing] ?? '') === written) {
            return { lines: [...lines], changed: false };
        }
        const rewritten = [...lines];
        rewritten[standing] = written;
        return { lines: rewritten, changed: true };
    }

    // An occurrence moved before ADR-0038 stands in an entry of its own,
    // somewhere else in the file. It is moved again where it is rather than
    // answered with a `MOVED` line here: the two would then both speak for the
    // day, and the file would draw the occurrence twice.
    const replacement = findReplacement(
        lines,
        findOrgProperty(lines, headingLine, ID_KEY)?.value ?? '',
        toIsoDate(occurrence)
    );
    if (replacement) {
        return rewriteReplacement(lines, replacement, to, time);
    }

    // Under the last of the entry's planning and `MOVED` lines, so that the
    // dates of one entry stay together and a second move does not push itself
    // between the first one and the timestamp it belongs to.
    const result = [...lines];
    result.splice(lastPlanningLine(lines, headingLine, repeating.line) + 1, 0, written);

    return { lines: result, changed: true };
}

/**
 * Which line of the entry already moves the occurrence of `day`, or `null`
 * where none does.
 */
export function findMovedLine(lines: readonly string[], headingLine: number, day: string): number | null {
    for (let i = headingLine + 1; i < lines.length; i++) {
        if (headingLevel(lines[i] ?? '') !== null) {
            break;
        }
        if (matchMovedLine(lines[i] ?? '')?.from === day) {
            return i;
        }
    }
    return null;
}

/**
 * The last line of the entry that carries a date -- a planning line or a
 * `MOVED` line -- which is what a new one is written under.
 */
function lastPlanningLine(lines: readonly string[], headingLine: number, planning: number): number {
    let last = planning;
    for (let i = headingLine + 1; i < lines.length; i++) {
        const text = lines[i] ?? '';
        if (headingLevel(text) !== null) {
            break;
        }
        if (matchMovedLine(text) || (matchTimestampLine(text) && i > last)) {
            last = i;
        }
    }
    return last;
}

/** Every occurrence the entry holds on another day, as its `MOVED` lines say. */
export function movedOccurrences(lines: readonly string[], headingLine: number): MovedLineFields[] {
    const found: MovedLineFields[] = [];
    for (let i = headingLine + 1; i < lines.length; i++) {
        if (headingLevel(lines[i] ?? '') !== null) {
            break;
        }
        const moved = matchMovedLine(lines[i] ?? '');
        // The first line naming an occurrence is the one that stands, which is
        // how the core resolves a file holding two of them.
        if (moved && !found.some((held) => held.from === moved.from)) {
            found.push(moved);
        }
    }
    return found;
}

/**
 * Move a replacement that is already written to another date or time.
 *
 * Only its timestamp is touched: the heading, the properties and the place in
 * the file are the ones the replacement was written with, and rewriting them
 * would move an entry the reader may since have added notes under.
 */
function rewriteReplacement(
    lines: readonly string[],
    standing: StandingReplacement,
    to: Date,
    time: string | null
): OccurrenceEdit {
    const planning = planningLines(lines, standing.headingLine)[0];
    if (!planning) {
        throw new OccurrenceError(
            `the entry standing in for ${standing.day} carries no planning line, so there is nothing to move`
        );
    }
    const line = lines[planning.line] ?? '';
    const rewritten = replacementLine(line, planning.span, to, time);
    if (rewritten === line) {
        return { lines: [...lines], changed: false };
    }
    const result = [...lines];
    result[planning.line] = rewritten;

    return { lines: result, changed: true };
}

/**
 * The weekday token the series' timestamp carries, as it is spelt there.
 *
 * A draft and a replacement are written in the file's own language: a series
 * reading `<2026-09-08 Пн 15:00 +1w>` is answered in Russian abbreviations,
 * and one that names no weekday is answered without one.
 */
export function seriesWeekday(lines: readonly string[], headingLine: number, heading: string): string | null {
    const repeating = findRepeatingLine(lines, headingLine, heading);
    const line = lines[repeating.line] ?? '';
    const second = fields(line, repeating.span)[1];
    if (!second) {
        return null;
    }
    const token = line.slice(second.start, second.end);
    return isWeekdayName(token) ? token : null;
}

/** One day a repeating entry falls on, and what the file already says about that day. */
export interface SeriesOccurrence {
    /** The day, as `YYYY-MM-DD`. */
    day: string;
    /** The hour the series is held at, as its timestamp writes it, or `null`. */
    time: string | null;
    /** An `EXDATE` of the series already leaves this day out. */
    cancelled: boolean;
    /** An entry of the file already stands in for this day. */
    moved: boolean;
}

/**
 * How many steps the walk may take before the series is treated as unreachable.
 *
 * A daily series whose first date is decades back is still counted out well
 * inside this; the limit is here so that a repeater the walk cannot advance
 * past `from` ends in a message rather than in a hung editor.
 */
const WALK_LIMIT = 100_000;

/** The repeater the entry's planning line carries. */
function repeaterOf(line: string, span: { start: number; end: number }): Repeater | null {
    for (const field of fields(line, span)) {
        const parsed = parseRepeater(line.slice(field.start, field.end));
        if (parsed) {
            return parsed;
        }
    }
    return null;
}

/** One repeater interval after `date`, whichever of the three forms it is written in. */
function step(date: Date, repeater: Repeater): Date {
    // `+N` from a given date is the plain interval, and that is what a listing
    // of the days a series falls on wants: `++N` and `.+N` differ in where
    // they resume from when an occurrence is closed, not in the calendar the
    // series keeps.
    return nextOccurrence({ base: date, today: date, repeater: { ...repeater, type: 'cumulative' } });
}

/**
 * The days a repeating entry falls on, from `from` onwards.
 *
 * This is what the caller offers instead of asking for a date to be typed:
 * the occurrence an exception is made to is one of these days, and the reader
 * knows it as "the next one" or "the one after that" rather than as a number
 * they have to work out from the repeater.
 *
 * Days the series has already lost are listed with the rest and marked, not
 * left out: seeing that the day is already cancelled -- or already moved -- is
 * the answer to why the entry is not on the agenda, and hiding it would make
 * the reader count the weeks again to be sure they picked the right one.
 */
export function listOccurrences(
    lines: readonly string[],
    headingLine: number,
    heading: string,
    from: Date,
    count: number
): SeriesOccurrence[] {
    const repeating = findRepeatingLine(lines, headingLine, heading);
    const line = lines[repeating.line] ?? '';
    const written = fields(line, repeating.span)[0];
    const first = written ? line.slice(written.start, written.end) : '';
    if (!isIsoDate(first)) {
        throw new OccurrenceError(`${heading} begins its timestamp with ${first || 'nothing'} rather than a date`);
    }
    const repeater = repeaterOf(line, repeating.span);
    if (!repeater) {
        throw new OccurrenceError(`${heading} does not repeat, and an entry that does not repeat has no occurrences`);
    }
    if (repeater.unit === 'workday' || repeater.unit === 'hour') {
        // The same refusal completing a repeating task makes: working days
        // need the public calendar, which the extension does not hold, and an
        // hourly repeater names no day at all.
        throw new OccurrenceError(
            `${heading} repeats by ${repeater.unit === 'workday' ? 'working days' : 'the hour'}, which this listing cannot count out`
        );
    }

    const time = writtenTime(line, repeating.span);
    const series = findOrgProperty(lines, headingLine, ID_KEY)?.value ?? '';
    const moved = movedOccurrences(lines, headingLine);
    const excluded = new Set(
        (findOrgProperty(lines, headingLine, EXDATE_KEY)?.value ?? '').split(/[,\s]+/).filter((day) => day !== '')
    );

    if (!isIsoDate(first)) {
        throw new OccurrenceError(`${heading} names no day to count its occurrences from`);
    }
    let date = fromIsoDate(first);
    const wanted = toIsoDate(from);
    // Once for the whole listing rather than once per day offered: the days
    // are answered out of the map below.
    const replaced = replacementsOf(lines, series);
    const found: SeriesOccurrence[] = [];
    for (let taken = 0; found.length < count; taken += 1) {
        if (taken > WALK_LIMIT) {
            throw new OccurrenceError(`${heading} does not reach ${wanted} in ${WALK_LIMIT} repeats`);
        }
        const falls = toIsoDate(date);
        if (falls >= wanted) {
            found.push({
                day: falls,
                time,
                cancelled: excluded.has(falls),
                moved: moved.some((held) => held.from === falls) || replaced.has(falls)
            });
        }
        date = step(date, repeater);
    }
    return found;
}

/**
 * Whether the series a planning `timestamp` describes falls on `day`.
 *
 * What a `MOVED` line names has to be an occurrence the entry has: a move
 * holds an occurrence on another day, and there is no line that gives a series
 * a day it never had, so the extractor refuses one that names any other day
 * (its ADR-0040). This is the question its reader asks, asked here so that the
 * editor says the same thing while the line is being written.
 *
 * `null` where the question has no answer here: a timestamp beginning with
 * something other than a date, an entry that does not repeat, and the two
 * repeaters this extension does not count days for -- working days need the
 * public calendar it does not hold, and an hourly repeater names no day of its
 * own. `listOccurrences` refuses the same two, and a caller reports nothing
 * rather than guessing at a series it cannot count out.
 *
 * Every unit is answered by arithmetic from the entry's own first day, which
 * is how the extractor counts (`bracket_uniform_days`, `bracket_month`,
 * `bracket_year`). Counting instead by stepping from the previous occurrence
 * would disagree with it on a month anchored past the 28th: stepped, January
 * 31st reaches February 28th and then March 28th; counted from the base, the
 * series is on March 31st, and that is the day the agenda draws.
 */
export function seriesFallsOn(timestamp: string, day: string): boolean | null {
    const span = { start: 0, end: timestamp.length };
    const written = fields(timestamp, span)[0];
    const first = written ? timestamp.slice(written.start, written.end) : '';
    if (!isIsoDate(first) || !isIsoDate(day)) {
        return null;
    }
    const repeater = repeaterOf(timestamp, span);
    if (!repeater || repeater.unit === 'workday' || repeater.unit === 'hour') {
        return null;
    }
    // A series has nothing behind the day it starts on. Written `YYYY-MM-DD`,
    // days sort as they fall.
    if (day < first) {
        return false;
    }

    const base = fromIsoDate(first);
    const wanted = fromIsoDate(day);
    if (repeater.unit === 'day' || repeater.unit === 'week') {
        const apart = Math.round((wanted.getTime() - base.getTime()) / 86_400_000);
        return apart % (repeater.value * (repeater.unit === 'week' ? 7 : 1)) === 0;
    }

    const months = repeater.value * (repeater.unit === 'year' ? 12 : 1);
    const apart = (wanted.getFullYear() - base.getFullYear()) * 12 + (wanted.getMonth() - base.getMonth());
    return apart % months === 0 && toIsoDate(addMonths(base, apart)) === day;
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
