/**
 * Org repeaters: what a repeating task's next occurrence is.
 *
 * The rules follow Emacs Org-mode `org-auto-repeat-maybe` (lisp/org.el), the
 * same reading `markdown-org-ffi` works from (`src/planning.rs`), so a task
 * closed in the editor and a task closed on the phone end up on the same date:
 *
 *   * `+N`  takes exactly one step from the date in the file, even when the
 *           result is still in the past;
 *   * `++N` keeps stepping until it passes today, taking at least one step;
 *   * `.+N` restarts from today.
 *
 * Month arithmetic clamps — 2026-01-31 plus one month is 2026-02-28 — which is
 * what the core does and is deliberately NOT what `incrementTimestamp` does for
 * Shift+Up on the month field: there the overflow into the next month is org's
 * own `org-timestamp-change` behaviour. Two operations, two rules; a repeater
 * that overflowed would put the two clients on different dates, which is the
 * whole point of this module.
 *
 * vscode-free, so the rules are unit-tested directly.
 */

/** Which of the three forms the repeater is written in. */
export type RepeaterType = 'cumulative' | 'catchUp' | 'restart';

/** The unit the interval is counted in. `workday` is org's `wd`. */
export type RepeaterUnit = 'day' | 'week' | 'month' | 'year' | 'workday' | 'hour';

export interface Repeater {
    type: RepeaterType;
    value: number;
    unit: RepeaterUnit;
}

/** Thrown when a repeater parses but cannot be advanced. */
export class RepeaterError extends Error {}

const UNITS: Record<string, RepeaterUnit> = {
    wd: 'workday',
    d: 'day',
    w: 'week',
    m: 'month',
    y: 'year',
    h: 'hour'
};

// `.+` and `++` before `+`, `wd` before `d`: otherwise the engine commits to
// the shorter option and reads `.+1wd` as `+1` followed by junk. Same ordering
// as TIMESTAMP_REGEX, which is where these tokens are captured from.
const REPEATER_REGEX = /^(?<prefix>\.\+|\+\+|\+)(?<value>\d+)(?<unit>wd|[dwmyh])$/;

/** Parse `+1d`, `++2w`, `.+3m`; `null` for anything else. */
export function parseRepeater(token: string): Repeater | null {
    const match = REPEATER_REGEX.exec(token);
    if (!match?.groups) return null;

    const { prefix, value, unit } = match.groups;
    const parsed = parseInt(value ?? '', 10);
    if (!parsed) return null; // `+0d` would loop forever in a catch-up

    const mapped = UNITS[unit ?? ''];
    if (!mapped) return null;

    return {
        type: prefix === '.+' ? 'restart' : prefix === '++' ? 'catchUp' : 'cumulative',
        value: parsed,
        unit: mapped
    };
}

export interface NextOccurrenceOptions {
    /** The date currently in the file. */
    base: Date;
    /** What "today" is, as the caller sees it. */
    today: Date;
    repeater: Repeater;
    /**
     * Whether a date counts as a working day, for `wd` repeaters. Weekends and
     * public holidays are the caller's to know: the holiday list comes from the
     * extractor, and this module stays free of it.
     */
    isWorkday?: ((date: Date) => boolean) | undefined;
}

/**
 * How many repeats a catch-up may take before the timestamp is treated as
 * broken, matching the core's own limit. A daily repeater covers a century
 * well inside this.
 */
const CATCH_UP_LIMIT = 100_000;

/** The date a repeating task moves to when this occurrence is completed. */
export function nextOccurrence(options: NextOccurrenceOptions): Date {
    const { base, today, repeater } = options;

    if (repeater.unit === 'hour') {
        throw new RepeaterError(`an hourly repeater cannot be advanced by date: ${describe(repeater)}`);
    }

    switch (repeater.type) {
        case 'cumulative':
            return step(base, options);
        case 'restart':
            return step(today, options);
        case 'catchUp': {
            // At least one step, then as many as it takes to pass today —
            // upstream's loop, which always runs its body once.
            let date = step(base, options);
            for (let taken = 0; startOfDay(date) <= startOfDay(today); taken += 1) {
                if (taken > CATCH_UP_LIMIT) {
                    throw new RepeaterError(`${CATCH_UP_LIMIT} repeats of ${describe(repeater)} do not reach today`);
                }
                date = step(date, options);
            }
            return date;
        }
    }
}

/** One repeater interval after `date`. */
function step(date: Date, options: NextOccurrenceOptions): Date {
    const { repeater, isWorkday } = options;
    const moved = new Date(date.getTime());

    switch (repeater.unit) {
        case 'day':
            moved.setDate(moved.getDate() + repeater.value);
            return moved;
        case 'week':
            moved.setDate(moved.getDate() + repeater.value * 7);
            return moved;
        case 'month':
            return addMonths(moved, repeater.value);
        case 'year':
            return addMonths(moved, repeater.value * 12);
        case 'workday': {
            if (!isWorkday) {
                throw new RepeaterError(`${describe(repeater)} needs the working calendar, which was not supplied`);
            }
            for (let taken = 0; taken < repeater.value; taken += 1) {
                do {
                    moved.setDate(moved.getDate() + 1);
                } while (!isWorkday(moved));
            }
            return moved;
        }
        case 'hour':
            throw new RepeaterError(`an hourly repeater cannot be advanced by date: ${describe(repeater)}`);
    }
}

/**
 * `months` after `date`, with the day clamped to the length of the target
 * month rather than spilling into the next one.
 */
export function addMonths(date: Date, months: number): Date {
    const target = new Date(date.getTime());
    const day = target.getDate();

    // The first of the month first: setMonth on the 31st would roll the month
    // forward before the clamp below ever ran.
    target.setDate(1);
    target.setMonth(target.getMonth() + months);
    target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
    return target;
}

/** Days in `month` (0-based, as `Date` counts them) of `year`. */
function daysInMonth(year: number, month: number): number {
    // Day zero of the next month is the last day of this one.
    return new Date(year, month + 1, 0).getDate();
}

/** Midnight of the day `date` falls on, for comparing dates without their time. */
function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The repeater as it is written in a file, for a message about it. */
export function describe(repeater: Repeater): string {
    const prefix = repeater.type === 'restart' ? '.+' : repeater.type === 'catchUp' ? '++' : '+';
    const unit = Object.entries(UNITS).find(([, value]) => value === repeater.unit)?.[0] ?? '';
    return `${prefix}${repeater.value}${unit}`;
}
