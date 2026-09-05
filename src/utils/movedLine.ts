/**
 * The line that moves one occurrence of a series, and how it is read back.
 *
 * ````text
 * # TODO English
 * `SCHEDULED: <2026-09-08 Mon 15:00 +1w>`
 * `MOVED: 2026-09-08 -> <2026-09-15 Tue 13:00>`
 * ````
 *
 * The line stands in the entry the series is written in, which is where the
 * reader looks for it (the extractor's ADR-0038). It is written the way the
 * planning lines around it are -- an inline-code span, at their indentation --
 * and what follows the arrow is an ordinary active timestamp, so Shift+Up and
 * Shift+Down walk it like any other date the editor holds.
 *
 * The day being moved stands first and outside the brackets: it names which
 * occurrence the line is about, and, standing bare, it is not a timestamp the
 * arrow keys can walk, so they move only where the occurrence is going.
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

const MOVED_REGEX = /^(?<indent>\s*)`MOVED: (?<from>\d{4}-\d{2}-\d{2}) -> <(?<to>\d{4}-\d{2}-\d{2})(?<rest>[^>]*)>`$/;

/** Read a `MOVED` line; `null` for any other line. */
export function matchMovedLine(text: string): MovedOccurrence | null {
    const match = MOVED_REGEX.exec(text);
    if (!match?.groups) {
        return null;
    }
    const { from, to, rest } = match.groups;
    const time = /(?<time>\d{2}:\d{2}(?:-\d{2}:\d{2})?)/.exec(rest ?? '')?.groups?.time ?? null;
    return { from: from ?? '', to: to ?? '', time };
}

/**
 * The `MOVED` line for holding `from` on `to`.
 *
 * `weekday` is the weekday as the series' own timestamp spells it, so that a
 * file writing "Пн" is not answered with "Mon"; where the series names no
 * weekday, neither does the line.
 */
export function movedLine(indent: string, from: string, to: Date, time: string | null, weekday: string | null): string {
    const named = weekday === null ? '' : ` ${spelt(to, weekday)}`;
    const held = time === null ? '' : ` ${time}`;
    return `${indent}\`MOVED: ${from} -> <${toIsoDate(to)}${named}${held}>\``;
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
