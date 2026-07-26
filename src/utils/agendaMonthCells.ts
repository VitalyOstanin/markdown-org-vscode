import { DayAgenda } from '../types';

/**
 * Month-calendar cell model: how much work each date carries.
 *
 * The month payload is the same per-day bucket structure as the week agenda
 * (see `DayAgenda`), so a cell only needs two numbers: how many tasks fall on
 * that date and how many of them are overdue. The calendar renders the total
 * as a count chip and tints that chip when the day has overdue work, instead
 * of the earlier binary "has tasks" dot.
 *
 * Pure and unit-tested here, then embedded into the webview via `.toString()`,
 * so these tests transitively cover the rendered chips. Keep it
 * self-contained: it may only touch its parameters, never module-scope imports
 * (the `DayAgenda` import is a type, erased at compile time and absent from
 * the `.toString()` body).
 */

export interface MonthCellCounts {
    /** Tasks on this date across all four buckets. */
    total: number;
    /** Tasks in this date's overdue bucket. */
    overdue: number;
}

/** Date (`YYYY-MM-DD`) -> counts, for every date the payload carries tasks on. */
export type MonthDayIndex = Record<string, MonthCellCounts>;

/**
 * Index a month payload by date. Dates with no tasks are omitted, so the
 * renderer can treat a missing key as "empty day". Month payloads may omit
 * empty buckets entirely (see `DayAgenda` docs), hence the defensive
 * array checks.
 */
export function buildMonthDayIndex(days: DayAgenda[]): MonthDayIndex {
    const index: MonthDayIndex = {};
    const list = Array.isArray(days) ? days : [];
    for (const day of list) {
        if (!day?.date) {
            continue;
        }
        // Inlined (not a module-scope helper) so the whole function survives
        // the `.toString()` injection into the webview.
        const len = (bucket: unknown): number => (Array.isArray(bucket) ? bucket.length : 0);
        const overdue = len(day.overdue);
        const total = overdue + len(day.scheduled_timed) + len(day.scheduled_no_time) + len(day.upcoming);
        if (total > 0) {
            index[day.date] = { total, overdue };
        }
    }
    return index;
}
