/**
 * Pure-TS analyser for the `MOVED` line that holds one occurrence of a series
 * on another day. No `vscode` dependency so unit tests can exercise it; the
 * adapter that turns these results into `vscode.Diagnostic` /
 * `vscode.CodeAction` lives in `./movedLineDiagnostics.ts`.
 *
 * What the line may say is settled by the extractor's ADR-0038 and ADR-0039,
 * and the refusals below are the ones its reader reports through the
 * `org-properties` channel -- where a reader who is not looking for warnings
 * never sees them. The point of repeating the rules here is that the editor
 * says the same thing at the moment the line is written.
 */

import { headingLevel, matchTimestampLine } from '../orgPatterns';
import { namedGroups } from '../utils/regexGroups';
import { getWeekdayName } from '../utils/incrementTimestamp';
import { weekdaySample } from '../utils/movedLine';
import { parseRepeater } from '../utils/repeater';

/** `MOVED: <anything>` inside an inline-code span, at any indentation. */
const MOVED_LINE_REGEX = /^(?<indent>\s*)`MOVED:(?<body>[^`]*)`\s*$/;

/**
 * One half of the line, read as leniently as the diagnostics need: brackets
 * optional and unpaired ones allowed, so a mixed pair is reported as itself
 * rather than as "not a date". The token grammar (repeater prefixes, units,
 * warning cookie) mirrors `TIMESTAMP_REGEX` in `../utils/timestampParts.ts`,
 * which in turn mirrors the extractor's.
 */
const HALF_REGEX =
    /^(?<open>[<[])?(?<date>\d{4}-\d{2}-\d{2})(?: (?<weekday>[А-Яа-яA-Za-z]+))?(?: (?<time>\d{2}:\d{2}(?:-\d{2}:\d{2})?))?(?: (?<repeater>(?:\.\+|\+\+|\+)\d+(?:wd|[dwmyh])))?(?: (?<warning>-\d+[dwmyh]))?(?<close>[>\]])?$/;

export type MovedViolationKind =
    | 'no-arrow'
    | 'occurrence-not-a-date'
    | 'occurrence-bare'
    | 'entry-does-not-repeat'
    | 'occurrence-mixed-pair'
    | 'occurrence-active'
    | 'occurrence-has-a-repeater'
    | 'occurrence-has-a-warning-cookie'
    | 'occurrence-has-an-hour'
    | 'occurrence-moved-twice'
    | 'target-not-a-timestamp'
    | 'target-mixed-pair'
    | 'target-inactive'
    | 'target-has-a-repeater'
    | 'target-has-a-warning-cookie';

export interface MovedViolation {
    /** Zero-based line number in the document. */
    line: number;
    /** Inclusive start column of the text the diagnostic underlines. */
    startCharacter: number;
    /** Exclusive end column. */
    endCharacter: number;
    kind: MovedViolationKind;
    /** Human-readable diagnostic message. */
    message: string;
    /**
     * Text that replaces `[startCharacter, endCharacter)` to satisfy the rule,
     * or `null` when the editor cannot guess what was meant -- a half that is
     * not a date at all, and a day this entry already moved.
     */
    replacement: string | null;
    /** Title of the quick fix offering `replacement`. Null when there is none. */
    fixTitle: string | null;
}

/**
 * Analyse a document's lines and return every `MOVED` line the extractor would
 * refuse. Lines that are not `MOVED` lines are ignored; a heading starts a new
 * entry, which is what makes "this entry moves the day twice" answerable.
 *
 * Each entry is read whole before its moves are judged, because a planning
 * line is not always written above them: a series whose `SCHEDULED` stands
 * below its `MOVED` line repeats just the same, and walking the file line by
 * line called it an entry that does not repeat.
 */
export function validateMovedLines(lines: string[]): MovedViolation[] {
    const violations: MovedViolation[] = [];
    const fallbackWeekday = weekdaySample(lines);

    for (const [from, to] of entryRanges(lines)) {
        const entry = readEntry(lines, from, to);
        for (let line = from; line < to; line++) {
            violations.push(...validateMovedLine(lines[line] ?? '', line, entry, fallbackWeekday));
        }
    }

    return violations;
}

/**
 * Half-open line ranges of the document's entries, whatever stands above the
 * first heading included as one of its own.
 */
function entryRanges(lines: readonly string[]): [number, number][] {
    const starts = [0];
    lines.forEach((text, line) => {
        if (line > 0 && headingLevel(text) !== null) {
            starts.push(line);
        }
    });
    return starts.map((from, index) => [from, starts[index + 1] ?? lines.length]);
}

/** What the entry's own lines say about the moves standing in it. */
function readEntry(lines: readonly string[], from: number, to: number): Entry {
    const entry: Entry = { daysMoved: new Set<string>(), weekday: null, repeats: false };
    for (let line = from; line < to; line++) {
        const planning = planningTimestamp(lines[line] ?? '');
        if (planning === null) {
            continue;
        }
        entry.weekday ??= weekdayOf(planning);
        entry.repeats ||= carriesRepeater(planning);
    }
    return entry;
}

/** What the lines above a `MOVED` line say about the entry it belongs to. */
interface Entry {
    /** Days this entry already moves, so a second answer for one is visible. */
    daysMoved: Set<string>;
    /**
     * The weekday of the entry's own planning line, as that line spells it --
     * the sample the address is written from, so a file writing "Пн" is not
     * answered with "Mon". Null where the planning line names no weekday.
     */
    weekday: string | null;
    /**
     * A planning line of the entry carries a repeater. An entry that does not
     * repeat has one date and no occurrences, so there is nothing for a move
     * to name.
     */
    repeats: boolean;
}

/** A keyword written in the inactive brackets, timestamp and all. */
const KEYWORD_INACTIVE_REGEX = /`(?:SCHEDULED|DEADLINE): (?<timestamp>\[[^\]]*\])`/;

/** The weekday a timestamp spells, so a fix offers the entry's own language. */
const WEEKDAY_REGEX = /^[<[]\d{4}-\d{2}-\d{2} (?<weekday>[А-Яа-яA-Za-z]+)/;

/**
 * The timestamp of a line that plans the entry for a day, or null.
 *
 * A series is kept on a `SCHEDULED`, a `DEADLINE`, or a bare active timestamp
 * -- the same three `occurrenceEdit` counts occurrences by, so the warning and
 * the command that writes the line read the entry alike. A keyword written in
 * the inactive brackets is read as a planning line too: that is a fault of its
 * own, reported by the bracket diagnostics, and reading it as no series here
 * would answer one fault with a second, unrelated complaint.
 */
function planningTimestamp(text: string): string | null {
    const hit = matchTimestampLine(text);
    if (hit && (hit.type === 'SCHEDULED' || hit.type === 'DEADLINE' || (hit.type === 'PLAIN' && hit.active))) {
        return hit.timestamp;
    }
    return KEYWORD_INACTIVE_REGEX.exec(text)?.groups?.timestamp ?? null;
}

/** Whether a planning timestamp repeats, and so has occurrences to move. */
function carriesRepeater(timestamp: string): boolean {
    return timestamp
        .slice(1, -1)
        .split(/\s+/)
        .some((field) => parseRepeater(field) !== null);
}

function weekdayOf(timestamp: string): string | null {
    return WEEKDAY_REGEX.exec(timestamp)?.groups?.weekday ?? null;
}

function validateMovedLine(text: string, line: number, entry: Entry, fallbackWeekday: string): MovedViolation[] {
    const matched = MOVED_LINE_REGEX.exec(text);
    if (!matched?.groups) return [];

    const { body } = namedGroups(matched, 'body');
    const bodyStart = text.indexOf('`') + '`MOVED:'.length;

    // Reported beside whatever the line itself says, not instead of it: the
    // entry gaining a repeater and the line being well-formed are two
    // corrections, and hiding one behind the other means finding it twice.
    const found: MovedViolation[] = entry.repeats
        ? []
        : [
              {
                  line,
                  startCharacter: text.indexOf('`'),
                  endCharacter: text.lastIndexOf('`') + 1,
                  kind: 'entry-does-not-repeat',
                  message:
                      'A move names one occurrence of a series, and this entry does not repeat: its ' +
                      'planning line carries no repeater, so it has one date and no occurrences to move. ' +
                      'Change the date itself, or give the entry a repeater (ADR-0038).',
                  replacement: null,
                  fixTitle: null
              }
          ];

    const arrow = body.indexOf('->');
    if (arrow < 0) {
        found.push({
            line,
            startCharacter: bodyStart,
            endCharacter: bodyStart + body.length,
            kind: 'no-arrow',
            message:
                'A move says which occurrence and where it is held, separated by `->`. ' +
                'The extractor reads this line as prose and leaves the occurrence where it was (ADR-0038).',
            replacement: null,
            fixTitle: null
        });
        return found;
    }

    const left = span(body, bodyStart, 0, arrow);
    const right = span(body, bodyStart, arrow + '->'.length, body.length);

    const half = occurrenceViolation(left, line, entry, fallbackWeekday) ?? targetViolation(right, line);
    if (half) {
        found.push(half);
    }
    return found;
}

interface Half {
    /** The half with its surrounding whitespace removed. */
    text: string;
    /** Inclusive start column of `text` in the document line. */
    start: number;
    /** Exclusive end column. */
    end: number;
}

function span(body: string, bodyStart: number, from: number, to: number): Half {
    const raw = body.slice(from, to);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    return {
        text: trimmed,
        start: bodyStart + from + leading,
        end: bodyStart + from + leading + trimmed.length
    };
}

/**
 * The occurrence, before the arrow. The order of the checks is the extractor's
 * (`moved_occurrence_day` in its `src/exceptions.rs`): it stops at the first
 * refusal, so reporting a later one first would name a fault the reader does
 * not have yet.
 */
function occurrenceViolation(half: Half, line: number, entry: Entry, fallbackWeekday: string): MovedViolation | null {
    const at = (kind: MovedViolationKind, message: string, replacement: string | null, fixTitle: string | null) => ({
        line,
        startCharacter: half.start,
        endCharacter: half.end,
        kind,
        message,
        replacement,
        fixTitle
    });

    const parts = HALF_REGEX.exec(half.text);
    if (!parts?.groups) {
        return at(
            'occurrence-not-a-date',
            'The occurrence a move names is a day, written `YYYY-MM-DD` or as an inactive ' +
                'timestamp `[YYYY-MM-DD Day]` (ADR-0039). This one is neither, and the line is read as prose.',
            null,
            null
        );
    }

    const { date } = namedGroups(parts, 'date');
    const { open = '', close = '', time, repeater, warning } = parts.groups ?? {};

    if (open === '' && close === '' && half.text !== date) {
        // The extractor reads a bare occurrence only as `YYYY-MM-DD` exactly:
        // it parses the whole half as a date, and falls back to a timestamp
        // parse that needs brackets. A weekday or a repeater written bare is
        // therefore not a date to it, whatever it looks like.
        return at(
            'occurrence-not-a-date',
            'Written without brackets, the occurrence is read only as `YYYY-MM-DD` exactly, and this one ' +
                'says more. Anything beyond the day belongs inside an inactive timestamp (ADR-0039).',
            `[${inner(parts)}]`,
            `Convert to [${inner(parts)}]`
        );
    }
    if (!(open === '' && close === '') && !paired(open, close)) {
        return at(
            'occurrence-mixed-pair',
            `Mixed bracket pair "${open || '(none)'}...${close || '(none)'}". The occurrence is written bare ` +
                'or as an inactive timestamp `[...]`, and anything else is read as prose.',
            `[${inner(parts)}]`,
            `Convert to [${inner(parts)}]`
        );
    }
    if (open === '<') {
        return at(
            'occurrence-active',
            'The occurrence a move names is an address, not a time the entry is kept, so it is ' +
                'written inactive: `[...]` rather than `<...>` (ADR-0039).',
            `[${inner(parts)}]`,
            `Convert to [${inner(parts)}]`
        );
    }
    if (repeater) {
        return at(
            'occurrence-has-a-repeater',
            `The occurrence carries the repeater ${repeater}, but it names one day of the series, and ` +
                'the repeater belongs to the series’ own planning line (ADR-0039).',
            without(half.text, repeater),
            'Drop the repeater'
        );
    }
    if (warning) {
        return at(
            'occurrence-has-a-warning-cookie',
            `The occurrence carries the warning cookie ${warning}, but how far ahead a deadline warns ` +
                'belongs to the series (ADR-0039).',
            without(half.text, warning),
            'Drop the warning cookie'
        );
    }
    if (time) {
        return at(
            'occurrence-has-an-hour',
            `The occurrence is named to the hour (${time}), but a series draws at most one occurrence a day, ` +
                'so a day names it on its own (ADR-0039).',
            without(half.text, time),
            'Drop the hour'
        );
    }
    if (entry.daysMoved.has(date)) {
        return at(
            'occurrence-moved-twice',
            `This entry already moves ${date}. The extractor keeps the first move and reads this line as ` +
                'prose, so the second day it names is not where the occurrence is drawn (ADR-0038).',
            null,
            null
        );
    }

    entry.daysMoved.add(date);

    if (open === '') {
        const written = address(date, entry.weekday ?? fallbackWeekday);
        return at(
            'occurrence-bare',
            'The occurrence a move names is written as an inactive timestamp, so that both halves of the ' +
                'line are timestamps and both are stepped with the date keys (ADR-0039). A bare date is ' +
                'still read, and is what this extension wrote before.',
            written,
            `Convert to ${written}`
        );
    }

    return null;
}

/** The occurrence written the way this extension writes it, weekday and all. */
function address(date: string, sample: string): string {
    const [year, month, day] = date.split('-').map(Number);
    const name = getWeekdayName(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1), sample);
    return `[${date} ${sample === sample.toLowerCase() ? name.toLowerCase() : name}]`;
}

/**
 * Where the occurrence is held, after the arrow. Order mirrors `parse_moved`
 * in the extractor's `src/exceptions.rs`.
 */
function targetViolation(half: Half, line: number): MovedViolation | null {
    const at = (kind: MovedViolationKind, message: string, replacement: string | null, fixTitle: string | null) => ({
        line,
        startCharacter: half.start,
        endCharacter: half.end,
        kind,
        message,
        replacement,
        fixTitle
    });

    const parts = HALF_REGEX.exec(half.text);
    if (!parts?.groups) {
        return at(
            'target-not-a-timestamp',
            'Where an occurrence is held is an active timestamp, `<YYYY-MM-DD Day HH:MM>` (ADR-0038). ' +
                'This one is not a timestamp, and the line is read as prose.',
            null,
            null
        );
    }

    const { open = '', close = '', repeater, warning } = parts.groups ?? {};

    if (open === '' && close === '') {
        return at(
            'target-not-a-timestamp',
            'Where an occurrence is held is an active timestamp and carries its brackets: ' +
                `<${inner(parts)}> (ADR-0038).`,
            `<${inner(parts)}>`,
            `Convert to <${inner(parts)}>`
        );
    }
    if (!paired(open, close)) {
        return at(
            'target-mixed-pair',
            `Mixed bracket pair "${open || '(none)'}...${close || '(none)'}". Where an occurrence is held ` +
                'is written `<...>`, and anything else is read as prose.',
            `<${inner(parts)}>`,
            `Convert to <${inner(parts)}>`
        );
    }
    if (open === '[') {
        return at(
            'target-inactive',
            'Where an occurrence is held is when the entry is actually kept, so it is written active: ' +
                '`<...>` rather than `[...]` (ADR-0038).',
            `<${inner(parts)}>`,
            `Convert to <${inner(parts)}>`
        );
    }
    if (repeater) {
        return at(
            'target-has-a-repeater',
            `Where an occurrence is held carries the repeater ${repeater}, and one occurrence does not ` +
                'repeat -- the repeater belongs to the series (ADR-0038).',
            without(half.text, repeater),
            'Drop the repeater'
        );
    }
    if (warning) {
        return at(
            'target-has-a-warning-cookie',
            `Where an occurrence is held carries the warning cookie ${warning}, and how far ahead a ` +
                'deadline warns belongs to the series (ADR-0038).',
            without(half.text, warning),
            'Drop the warning cookie'
        );
    }

    return null;
}

/** Whether the two brackets are a pair Org writes: `<...>` or `[...]`. */
function paired(open: string, close: string): boolean {
    return (open === '<' && close === '>') || (open === '[' && close === ']');
}

/** The half without its brackets: date, weekday, hour, repeater, cookie. */
function inner(parts: RegExpExecArray): string {
    const { open = '', close = '' } = parts.groups ?? {};
    const whole = parts[0];
    return whole.slice(open ? 1 : 0, close ? whole.length - 1 : whole.length);
}

/**
 * The half with one token taken out and its brackets left as they were. Only
 * the token named is dropped: a line carrying both a repeater and an hour has
 * two faults, and fixing them one at a time is what the reader is shown.
 */
function without(text: string, drop: string): string {
    return text.replace(` ${drop}`, '');
}
