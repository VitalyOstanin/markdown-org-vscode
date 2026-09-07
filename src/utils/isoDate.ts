/**
 * Whether `value` is a `YYYY-MM-DD` string naming a real calendar day.
 *
 * The agenda webview posts an anchor date back to the extension, which hands
 * it to `markdown-org-extract` as `--date`. The value is checked here rather
 * than forwarded verbatim: the shape must match what the CLI accepts, and a
 * well-formed but impossible day (`2026-02-30`) would only surface as an
 * extractor error much later.
 */
import { splitInto } from './regexGroups';

export function isIsoDate(value: string | undefined | null): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const [rawYear, rawMonth, rawDay] = splitInto(value, '-', 3);
    const [year, month, day] = [Number(rawYear), Number(rawMonth), Number(rawDay)];
    const date = fromIsoDate(value);
    // Round-trip guards against overflow: `new Date(2026, 1, 30)` silently
    // becomes March 2, so a mismatch means the input named no such day.
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * `YYYY-MM-DD` as a local date, the single answer to "what day is this string".
 *
 * Built field by field rather than parsed: `new Date('2026-09-07')` reads a
 * bare date as UTC, which lands on the previous day west of Greenwich. The
 * parts are read with `splitInto`, so a value of another shape says so here
 * rather than becoming a date silently a year or a month off -- which is what
 * the `?? 0` / `?? 1` fallbacks written around the project did.
 */
export function fromIsoDate(value: string): Date {
    const [year, month, day] = splitInto(value, '-', 3);
    return new Date(Number(year), Number(month) - 1, Number(day));
}

/** Format a Date as a local `YYYY-MM-DD` string (no timezone conversion). */
export function toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
