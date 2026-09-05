/**
 * The draft line a move is written in, and how it is read back.
 *
 * Moving one occurrence of a series asks for a date, and a date is a thing
 * the editor is already good at: Shift+Up and Shift+Down walk whichever field
 * of a timestamp the caret sits on. So the command writes the answer it
 * proposes into the notes as a line of its own and steps aside, rather than
 * opening a box where those keys do nothing and the date has to be typed out.
 *
 * ````text
 * # TODO English
 * `SCHEDULED: <2026-09-08 Tue 15:00 +1w>`
 * `MOVE 2026-09-08 -> <2026-09-15 Tue 15:00>`   <- the draft
 * ````
 *
 * The day being moved is written first and outside the brackets: it names
 * what the draft is about -- a draft found in the notes a day later is still
 * readable -- and, standing bare, it is not a timestamp the arrow keys can
 * walk, so the field the caret starts on is the only one they move.
 *
 * No keyword of the format is used and none of these lines is a timestamp
 * line: neither the extractor nor this extension reads a draft as planning,
 * so an unfinished one shows up on no agenda.
 */
import { getWeekdayName } from './incrementTimestamp';
import { toIsoDate } from './isoDate';

/** What the draft line says: which occurrence moves, and where to. */
export interface OccurrenceDraft {
    /** The day being moved, as `YYYY-MM-DD`. */
    from: string;
    /** The day it moves to. */
    to: string;
    /** The hour it moves to, or `null` where the draft names no hour. */
    time: string | null;
}

const DRAFT_REGEX = /^(?<indent>\s*)`MOVE (?<from>\d{4}-\d{2}-\d{2}) -> <(?<to>\d{4}-\d{2}-\d{2})(?<rest>[^>]*)>`$/;

/** Read a draft line; `null` for any other line. */
export function matchOccurrenceDraft(text: string): OccurrenceDraft | null {
    const match = DRAFT_REGEX.exec(text);
    if (!match?.groups) {
        return null;
    }
    const { from, to, rest } = match.groups;
    const time = /(?<time>\d{2}:\d{2})/.exec(rest ?? '')?.groups?.time ?? null;
    return { from: from ?? '', to: to ?? '', time };
}

/**
 * The draft line for moving `from` to `to`.
 *
 * `weekday` is the weekday as the series' own timestamp spells it, so that a
 * file writing "Пн" is not answered with "Mon"; where the series names no
 * weekday, neither does the draft.
 */
export function occurrenceDraftLine(
    indent: string,
    from: string,
    to: Date,
    time: string | null,
    weekday: string | null
): string {
    const named = weekday === null ? '' : ` ${spelt(to, weekday)}`;
    const held = time === null ? '' : ` ${time}`;
    return `${indent}\`MOVE ${from} -> <${toIsoDate(to)}${named}${held}>\``;
}

/** The weekday of `date`, written the way `sample` is. */
function spelt(date: Date, sample: string): string {
    const name = getWeekdayName(date, sample);
    return sample === sample.toLowerCase() ? name.toLowerCase() : name;
}

/** Where the caret goes when the draft is written: the day of the target timestamp. */
export function draftDayColumn(line: string): number {
    const at = line.indexOf('-> <');
    return at < 0 ? line.length : at + '-> <'.length;
}
