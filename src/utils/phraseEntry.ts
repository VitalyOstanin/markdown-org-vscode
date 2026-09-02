import type { TaskStatus } from '../types';
import { buildHeading } from './buildHeading';
import { buildOrgTimestamp } from './orgTimestamp';

/**
 * What `markdown-org-extract parse-phrase` answers, and how those fields turn
 * into the lines of an entry.
 *
 * The rules that read a sentence live in the extractor, beside the grammar of
 * the timestamps they produce, so the editor and the phone understand a phrase
 * the same way. What is here is the crossing: the JSON it prints, and the two
 * lines the file gets. Nothing in this module touches `vscode`, so both halves
 * are unit-tested without an extension host.
 */

/** The parsed fields, in the shapes the extractor prints them. */
export interface PhraseFields {
    /** The day the phrases were read against, `YYYY-MM-DD`. */
    currentDate: string;
    /** The heading's own text, without a keyword or a priority cookie. */
    heading: string;
    /** Bare priority (`A`, `12`), without the `[#` `]` framing. */
    priority?: string | undefined;
    /** Which planning line the date belongs on, when the phrase said. */
    planning?: 'scheduled' | 'deadline' | undefined;
    /** `YYYY-MM-DD`. */
    date?: string | undefined;
    /** `HH:MM`. */
    time?: string | undefined;
    /** An org repeater (`+1w`), written the canonical way. */
    repeater?: string | undefined;
    /**
     * The keyword the phrase named, for an edit of an entry that exists. A
     * phrase that creates one names none: every entry written by phrase is a
     * task, and the keyword it gets is `TODO`.
     */
    keyword?: TaskStatus | undefined;
    /**
     * The fields the phrase said to empty, by the names the extractor prints:
     * `date`, `time`, `repeater`, `priority`. Empty for a phrase that emptied
     * nothing, which is every phrase that creates an entry.
     */
    cleared: readonly string[];
}

/** The keywords a phrase can name, which are the ones a heading can carry. */
const TASK_KEYWORDS: readonly TaskStatus[] = ['TODO', 'DONE', 'CANCELLED', 'CANCELED'];

/** A field the extractor prints as `null` is absent, not empty. */
function optional(value: unknown, field: string): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`parse-phrase: ${field} is ${typeof value}, expected a string or null`);
    }
    return value;
}

/**
 * Read what `parse-phrase` printed.
 *
 * The shape is checked rather than trusted: a binary older than the pin does
 * not know the subcommand at all and fails before printing, but a future one
 * may add fields, and an unreadable answer must name itself rather than
 * surface later as an entry with an empty heading.
 */
export function parsePhraseFields(stdout: string): PhraseFields {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('parse-phrase: expected a JSON object');
    }
    const raw = parsed as Record<string, unknown>;
    const heading = raw.heading;
    const currentDate = raw.current_date;
    if (typeof heading !== 'string' || typeof currentDate !== 'string') {
        throw new Error('parse-phrase: heading and current_date are required');
    }
    const planning = optional(raw.planning, 'planning');
    if (planning !== undefined && planning !== 'scheduled' && planning !== 'deadline') {
        throw new Error(`parse-phrase: planning is ${planning}, expected scheduled or deadline`);
    }
    const keyword = optional(raw.keyword, 'keyword');
    if (keyword !== undefined && !TASK_KEYWORDS.includes(keyword as TaskStatus)) {
        throw new Error(`parse-phrase: keyword is ${keyword}, expected ${TASK_KEYWORDS.join(', ')}`);
    }
    return {
        currentDate,
        heading,
        priority: optional(raw.priority, 'priority'),
        planning,
        date: optional(raw.date, 'date'),
        time: optional(raw.time, 'time'),
        repeater: optional(raw.repeater, 'repeater'),
        keyword: keyword as TaskStatus | undefined,
        cleared: clearedFields(raw.cleared)
    };
}

/**
 * The names of the emptied fields.
 *
 * Absent rather than empty in the answer of a binary older than the one that
 * prints it, which is read as "nothing was emptied": the pin makes such a
 * binary unlikely, and a phrase that empties a field is refused by the version
 * check long before it is parsed.
 */
function clearedFields(value: unknown): string[] {
    if (value === null || value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || value.some((name) => typeof name !== 'string')) {
        throw new Error('parse-phrase: cleared is not an array of field names');
    }
    return value as string[];
}

/** How the entry is written: where it goes and what the timestamp reads as. */
export interface PhraseEntryOptions {
    /** Leading `#` run for the heading, fixing its level in the file. */
    hashes: string;
    /** Indent of the planning line under the heading. */
    indent: string;
    /** Localized short weekday names, Sunday first, as `Date.getDay()` indexes them. */
    weekdays: readonly string[];
    /**
     * The moment the entry is being written at, which the mark under the
     * heading carries to the minute.
     *
     * Fixed when the command opens, like the day the phrases are read against:
     * a chain of phrases spanning midnight marks the moment it began rather
     * than one no phrase was read against.
     */
    written: Date;
}

/** Whether the phrase said anything a timestamp can carry. */
function hasTimestamp(fields: PhraseFields): boolean {
    return fields.date !== undefined || fields.time !== undefined || fields.repeater !== undefined;
}

/**
 * The day the timestamp lands on.
 *
 * An hour or a repeater with no day of its own is the day the phrases were
 * read against: "позвонить в 15:00" is today at three, and an org timestamp
 * has no way to say an hour without a date to hang it on.
 */
function timestampDate(fields: PhraseFields): Date {
    const [year, month, day] = (fields.date ?? fields.currentDate).split('-').map(Number);
    const [hour, minute] = (fields.time ?? '00:00').split(':').map(Number);
    // Built field by field rather than parsed from the string: `new Date('...')`
    // reads a bare date as UTC, which lands on the previous day west of
    // Greenwich, and the weekday would then be the wrong one.
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
}

/**
 * The lines of the entry: the heading, the moment it was written at, and the
 * planning line under them when the phrase named a day, an hour or a repeater.
 *
 * A phrase that named no date is a heading and the mark — "купить хлеб" is a
 * task without a date, which is what the Tasks view is for. The planning
 * keyword defaults to `SCHEDULED`: a day said without one ("завтра") is when
 * the work is meant to happen, and a deadline is what the phrase has to say
 * outright.
 *
 * The mark is written by the phone the same way, and for the same reason: an
 * entry carries the moment it came into being, in the inactive brackets
 * org-mode's expiry convention uses so that no agenda reads the mark as a day
 * to keep.
 * Above the planning line, which is the order both write them in.
 */
export function phraseEntryLines(fields: PhraseFields, options: PhraseEntryOptions): string[] {
    return entryLines(fields, options, true);
}

/** The entry, with the creation mark only where the entry is being written. */
function entryLines(fields: PhraseFields, options: PhraseEntryOptions, marked: boolean): string[] {
    const heading = buildHeading({
        hashes: options.hashes,
        // Every entry written this way is a task: a phrase is how work is
        // added, and a heading that is not one is typed rather than said.
        status: 'TODO',
        priority: fields.priority,
        title: fields.heading
    });
    const { written } = options;
    // With the hour, unlike the planning line, which carries one only where
    // the phrase named a time: two entries written the same day are told apart
    // by the minute they were written at, and a day alone cannot do that.
    const created = `${options.indent}\`CREATED: ${buildOrgTimestamp({
        date: written,
        bracket: 'square',
        weekday: options.weekdays[written.getDay()],
        includeTime: true
    })}\``;
    const above = marked ? [heading, created] : [heading];
    if (!hasTimestamp(fields)) {
        return above;
    }
    const date = timestampDate(fields);
    const timestamp = buildOrgTimestamp({
        date,
        bracket: 'angle',
        weekday: options.weekdays[date.getDay()],
        includeTime: fields.time !== undefined,
        repeater: fields.repeater
    });
    const keyword = fields.planning === 'deadline' ? 'DEADLINE' : 'SCHEDULED';
    return [...above, `${options.indent}\`${keyword}: ${timestamp}\``];
}

/**
 * One line naming what has been understood so far, for the title of the input
 * box that asks for the next phrase.
 *
 * The screen the phone shows — every field in its own control — has no
 * counterpart in an editor, so this stands in for it: what would be written,
 * before it is written, so a phrase read wrong is corrected by saying more
 * rather than by editing the file afterwards.
 */
export function describePhraseFields(fields: PhraseFields, options: PhraseEntryOptions): string {
    // Without the creation mark: it says now whatever the phrase says, so a
    // line of it in the title would take room from what is being corrected.
    return entryLines(fields, options, false)
        .map((line) => line.trim())
        .join('  ');
}
