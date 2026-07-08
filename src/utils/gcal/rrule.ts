// Pure mapping from an org repeater to a Google Calendar RRULE (no I/O).
//
// The extractor surfaces the timestamp's repeater in canonical form via the
// `timestamp_repeater` field: a prefix (`+`, `++`, `.+`), a positive integer,
// and a unit (`d`/`w`/`m`/`y`/`h`, or `wd` for the workday extension). The
// three prefix flavours differ only in how org shifts the base date when a
// task is marked DONE (cumulative / catch-up / restart-from-completion); a
// Google recurring event is a fixed grid with no such notion, so the prefix
// does not affect the RRULE and is ignored here.

// prefix (ignored) + value + unit. Anchored so trailing junk is rejected.
const REPEATER_RE = /^[.+]+(\d+)(wd|[dwmyh])$/;

const UNIT_TO_FREQ: Record<string, string> = {
    d: 'DAILY',
    w: 'WEEKLY',
    m: 'MONTHLY',
    y: 'YEARLY',
    h: 'HOURLY'
};

/**
 * Map a canonical org repeater string to a Google Calendar `recurrence`
 * array, or `undefined` when the repeater cannot be represented as a single
 * RRULE.
 *
 * Mapping:
 * - `d`/`w`/`m`/`y`/`h` -> `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY|HOURLY`,
 *   with `INTERVAL=N` added when `N > 1`. A plain weekly/monthly/yearly rule
 *   inherits its BYDAY/BYMONTHDAY from the event start, so a Friday event with
 *   `+1w` recurs on Fridays without an explicit BYDAY.
 * - `+1wd` -> every workday: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`.
 * - `+Nwd` with `N > 1` ("every N-th workday") has no single-RRULE form and
 *   returns `undefined` (the event stays one-shot).
 * - anything unrecognised (bad shape, `N < 1`) returns `undefined`.
 */
export function repeaterToRrule(repeater: string | undefined): string[] | undefined {
    if (!repeater) {
        return undefined;
    }
    const m = REPEATER_RE.exec(repeater.trim());
    if (!m) {
        return undefined;
    }
    const n = parseInt(m[1], 10);
    const unit = m[2];
    // n comes from the matched `\d+`, so it always parses; only a zero step
    // (`+0d`) needs rejecting.
    if (n < 1) {
        return undefined;
    }

    if (unit === 'wd') {
        // Only "every workday" maps cleanly; "every N-th workday" does not.
        return n === 1 ? ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'] : undefined;
    }

    const freq = UNIT_TO_FREQ[unit];
    if (!freq) {
        return undefined;
    }
    const rule = n > 1 ? `RRULE:FREQ=${freq};INTERVAL=${n}` : `RRULE:FREQ=${freq}`;
    return [rule];
}
