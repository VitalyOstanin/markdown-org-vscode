/**
 * The line that moves one occurrence of a series, and how it is read back.
 *
 * ````text
 * # TODO English
 * `SCHEDULED: <2026-09-08 Mon 15:00 +1w>`
 * `MOVED: [2026-09-08 Mon] -> <2026-09-15 Tue 13:00>`
 * ````
 *
 * The line stands in the entry the series is written in, which is where the
 * reader looks for it (the extractor's ADR-0038). It is written the way the
 * planning lines around it are -- an inline-code span, at their indentation.
 *
 * Both halves are timestamps, so Shift+Up and Shift+Down walk either of them
 * like any other date the editor holds, and the brackets say which is which
 * (the extractor's ADR-0039): the occurrence before the arrow is an address,
 * written inactive, and the day it is held on is active. Written bare, the way
 * ADR-0038 first had it, the address is still read -- files hold it -- but it
 * is not what this extension writes.
 */
import { getWeekdayName } from './incrementTimestamp';
import { toIsoDate } from './isoDate';

/** What a `MOVED` line says: which occurrence moves, and where to. */
export interface MovedOccurrence {
    /** The day the series draws the occurrence on, as `YYYY-MM-DD`. */
    from: string;
    /** The day it is held on instead. */
    to: string;
    /** The hour it is held at -- `HH:MM`, or `HH:MM-HH:MM` -- or `null` where the line names none. */
    time: string | null;
}

// The address is read in both forms: the inactive timestamp written since
// ADR-0039 and the bare date of ADR-0038, which files already hold.
const MOVED_REGEX =
    /^(?<indent>\s*)`MOVED: (?:\[(?<held>\d{4}-\d{2}-\d{2})[^\]]*\]|(?<bare>\d{4}-\d{2}-\d{2})) -> <(?<to>\d{4}-\d{2}-\d{2})(?<rest>[^>]*)>`$/;

/** Read a `MOVED` line; `null` for any other line. */
export function matchMovedLine(text: string): MovedOccurrence | null {
    const match = MOVED_REGEX.exec(text);
    if (!match?.groups) {
        return null;
    }
    const { held, bare, to, rest } = match.groups;
    const time = /(?<time>\d{2}:\d{2}(?:-\d{2}:\d{2})?)/.exec(rest ?? '')?.groups?.time ?? null;
    return { from: held ?? bare ?? '', to: to ?? '', time };
}

/**
 * The `MOVED` line for holding `from` on `to`.
 *
 * `weekday` is the weekday as the series' own timestamp spells it, so that a
 * file writing "Пн" is not answered with "Mon"; where the series names no
 * weekday, neither half of the line names one.
 */
export function movedLine(indent: string, from: Date, to: Date, time: string | null, weekday: string | null): string {
    const address = weekday === null ? toIsoDate(from) : `${toIsoDate(from)} ${spelt(from, weekday)}`;
    const named = weekday === null ? '' : ` ${spelt(to, weekday)}`;
    const held = time === null ? '' : ` ${time}`;
    return `${indent}\`MOVED: [${address}] -> <${toIsoDate(to)}${named}${held}>\``;
}

/** The weekday of `date`, written the way `sample` is. */
function spelt(date: Date, sample: string): string {
    const name = getWeekdayName(date, sample);
    return sample === sample.toLowerCase() ? name.toLowerCase() : name;
}

/** Where the caret goes when the line is written: the day it moves to. */
export function movedDayColumn(line: string): number {
    const at = line.indexOf('-> <');
    return at < 0 ? line.length : at + '-> <'.length;
}
