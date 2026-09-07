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
import { WEEKDAY_SOURCE } from '../orgPatterns';
import { getWeekdayName } from './incrementTimestamp';
import { toIsoDate } from './isoDate';

/**
 * What a `MOVED` line says, as the line itself writes it.
 *
 * Not `MovedOccurrence` of `types.ts`, which is the same move as the extractor
 * reports it over JSON: there the hour and its end are two fields, absent
 * where the move names none, because that is the shape the wire has. Here the
 * hour is the text between the arrow and the closing bracket, range and all,
 * because that is what the editor writes back into the line unchanged.
 */
export interface MovedLineFields {
    /** The day the series draws the occurrence on, as `YYYY-MM-DD`. */
    from: string;
    /** The day it is held on instead. */
    to: string;
    /** The hour it is held at -- `HH:MM`, or `HH:MM-HH:MM` -- or `null` where the line names none. */
    time: string | null;
}

/**
 * `MOVED: <anything>` inside an inline-code span, at any indentation.
 *
 * The one shape of the line everything here agrees on -- what is written, what
 * is read back, and what the diagnostics judge. Reading it more strictly in
 * one place than in another is what let a line the extractor moves an
 * occurrence by go unfound: the command then wrote a second move for a day the
 * file already moves, which is the fault the diagnostics report.
 */
export const MOVED_LINE_REGEX = /^(?<indent>\s*)`MOVED:(?<body>[^`]*)`\s*$/;

// The address is read in both forms: the inactive timestamp written since
// ADR-0039 and the bare date of ADR-0038, which files already hold. Both are
// matched against the half with its surrounding whitespace gone, the way the
// extractor trims either side of the arrow.
const ADDRESS_REGEX = /^(?:\[(?<held>\d{4}-\d{2}-\d{2})[^\]]*\]|(?<bare>\d{4}-\d{2}-\d{2}))$/;
const TARGET_REGEX = /^<(?<to>\d{4}-\d{2}-\d{2})(?<rest>[^>]*)>$/;

/**
 * Read a `MOVED` line; `null` for any other line.
 *
 * Whitespace is read the way the extractor reads it: the value after the
 * keyword and each half of the arrow are trimmed, and a timestamp holds
 * whatever whitespace stands between its fields. The arrow is the first `->`
 * of the body, which is where the extractor splits.
 */
export function matchMovedLine(text: string): MovedLineFields | null {
    const body = MOVED_LINE_REGEX.exec(text)?.groups?.body;
    if (body === undefined) {
        return null;
    }
    const arrow = body.indexOf('->');
    if (arrow < 0) {
        return null;
    }
    const address = ADDRESS_REGEX.exec(body.slice(0, arrow).trim());
    const target = TARGET_REGEX.exec(body.slice(arrow + '->'.length).trim());
    if (!address?.groups || !target?.groups) {
        return null;
    }
    const { held, bare } = address.groups;
    const { to, rest } = target.groups;
    const time = /(?<time>\d{2}:\d{2}(?:-\d{2}:\d{2})?)/.exec(rest ?? '')?.groups?.time ?? null;
    return { from: held ?? bare ?? '', to: to ?? '', time };
}

/**
 * The `MOVED` line for holding `from` on `to`.
 *
 * `weekday` is a weekday spelt the way the file spells its own, so that a file
 * writing "Пн" is not answered with "Mon". Both halves carry one: a day named
 * by digits alone says nothing about a wrong step, and the weekday beside the
 * date is what makes one visible. `weekdaySample` finds the sample when the
 * series' own planning line names no weekday.
 */
export function movedLine(indent: string, from: Date, to: Date, time: string | null, weekday: string): string {
    const held = time === null ? '' : ` ${time}`;
    return (
        `${indent}\`MOVED: [${toIsoDate(from)} ${spelt(from, weekday)}] -> ` +
        `<${toIsoDate(to)} ${spelt(to, weekday)}${held}>\``
    );
}

/**
 * A weekday to spell new ones from: the first one the file already writes, so
 * the language is the file's rather than this extension's. `Mon` where the
 * file writes none at all -- a first move in a file of bare dates has to pick
 * something, and the date beside it names the day either way.
 */
export function weekdaySample(lines: readonly string[]): string {
    for (const line of lines) {
        const weekday = new RegExp(`[<[]\\d{4}-\\d{2}-\\d{2}\\s+(?<weekday>${WEEKDAY_SOURCE})`).exec(line)?.groups
            ?.weekday;
        if (weekday !== undefined) {
            return weekday;
        }
    }
    return 'Mon';
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
