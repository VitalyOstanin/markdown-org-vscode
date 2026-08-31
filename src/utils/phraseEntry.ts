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
}

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
    return {
        currentDate,
        heading,
        priority: optional(raw.priority, 'priority'),
        planning,
        date: optional(raw.date, 'date'),
        time: optional(raw.time, 'time'),
        repeater: optional(raw.repeater, 'repeater')
    };
}

/** How the entry is written: where it goes and what the timestamp reads as. */
export interface PhraseEntryOptions {
    /** Leading `#` run for the heading, fixing its level in the file. */
    hashes: string;
    /** Indent of the planning line under the heading. */
    indent: string;
    /** Localized short weekday names, Sunday first, as `Date.getDay()` indexes them. */
    weekdays: readonly string[];
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
 * The lines of the entry: the heading, and the planning line under it when the
 * phrase named a day, an hour or a repeater.
 *
 * A phrase that named neither is a heading and nothing else — "купить хлеб" is
 * a task without a date, which is what the Tasks view is for. The planning
 * keyword defaults to `SCHEDULED`: a day said without one ("завтра") is when
 * the work is meant to happen, and a deadline is what the phrase has to say
 * outright.
 */
export function phraseEntryLines(fields: PhraseFields, options: PhraseEntryOptions): string[] {
    const heading = buildHeading({
        hashes: options.hashes,
        // Every entry written this way is a task: a phrase is how work is
        // added, and a heading that is not one is typed rather than said.
        status: 'TODO',
        priority: fields.priority,
        title: fields.heading
    });
    if (!hasTimestamp(fields)) {
        return [heading];
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
    return [heading, `${options.indent}\`${keyword}: ${timestamp}\``];
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
    return phraseEntryLines(fields, options)
        .map((line) => line.trim())
        .join('  ');
}
