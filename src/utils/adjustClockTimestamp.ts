/**
 * Shifting one part of a CLOCK line up or down.
 *
 * A CLOCK line has two halves that obey the same rule, so the rule is written
 * once here and applied twice. It used to be written twice, once per half,
 * differing only in the `start`/`end` prefix of the group and part names --
 * which meant a new part, or a change to how the bracket is chosen, had to be
 * made in two places, and the compiler could not tell when only one of them
 * was.
 */
import { formatDurationHM } from './durationHM';
import { buildOrgTimestamp } from './orgTimestamp';
import { getWeekdayName } from './incrementTimestamp';
import { namedGroups } from './regexGroups';
import type { ClockTimestampPart } from './timestampParts';

/** Which half of the line a part belongs to, and the prefix its groups carry. */
type ClockHalf = 'start' | 'end';

/** The unit a part names, once its half has been stripped off. */
type ClockUnit = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute';

/**
 * How each unit moves the date. `weekday` steps whole days: the name is not
 * stored separately from the date, so moving to the next weekday is moving to
 * the next day, and the name is recomputed from where the date lands.
 */
const SHIFT: Record<ClockUnit, (date: Date, delta: number) => void> = {
    year: (date, delta) => date.setFullYear(date.getFullYear() + delta),
    month: (date, delta) => date.setMonth(date.getMonth() + delta),
    day: (date, delta) => date.setDate(date.getDate() + delta),
    weekday: (date, delta) => date.setDate(date.getDate() + delta),
    hour: (date, delta) => date.setHours(date.getHours() + delta),
    minute: (date, delta) => date.setMinutes(date.getMinutes() + delta)
};

/**
 * One half of the line, shifted by `delta` if `part` names a unit of this
 * half, and rendered back. Halves the part does not name are rebuilt
 * unchanged, which also normalizes a mismatched bracket pair (`[…>`, which
 * CLOCK_PARTS_REGEX permits and org never emits) into a matching one.
 */
function shiftClockHalf(
    match: RegExpMatchArray,
    half: ClockHalf,
    part: ClockTimestampPart,
    delta: number
): { date: Date; timestamp: string } {
    const g = namedGroups(
        match,
        `${half}OpenBracket` as const,
        `${half}Year` as const,
        `${half}Month` as const,
        `${half}Day` as const,
        `${half}Hour` as const,
        `${half}Minute` as const,
        `${half}Weekday` as const
    );
    const date = new Date(
        parseInt(g[`${half}Year`], 10),
        parseInt(g[`${half}Month`], 10) - 1,
        parseInt(g[`${half}Day`], 10),
        parseInt(g[`${half}Hour`], 10),
        parseInt(g[`${half}Minute`], 10)
    );

    const [named, unit] = part.split('-') as [ClockHalf, ClockUnit];
    if (named === half) {
        SHIFT[unit](date, delta);
    }

    return {
        date,
        timestamp: buildOrgTimestamp({
            date,
            bracket: g[`${half}OpenBracket`] === '<' ? 'angle' : 'square',
            weekday: getWeekdayName(date, g[`${half}Weekday`])
        })
    };
}

/**
 * The CLOCK line of `match`, with the part the cursor sits on moved by
 * `delta`. An entry that is still running has no end half and keeps none; a
 * closed one has its duration recomputed from the shifted halves.
 */
export function adjustClockTimestamp(match: RegExpMatchArray, part: ClockTimestampPart, delta: number): string {
    const { indent } = namedGroups(match, 'indent');
    const start = shiftClockHalf(match, 'start', part, delta);

    if (!match.groups?.endOpenBracket) {
        return `${indent}\`CLOCK: ${start.timestamp}\``;
    }

    const end = shiftClockHalf(match, 'end', part, delta);
    const duration = formatDurationHM(end.date.getTime() - start.date.getTime(), { padHoursWithSpace: true });

    return `${indent}\`CLOCK: ${start.timestamp}--${end.timestamp} => ${duration}\``;
}
