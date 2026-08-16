import type { DayAgenda, TaskWithOffset } from '../types';

/**
 * Month-calendar cell model: which dates the grid shows and how much work each
 * of them carries.
 *
 * The month payload is the same per-day bucket structure as the week agenda
 * (see `DayAgenda`), so a cell only needs a count and a mark: how many tasks
 * fall on that date, and whether the date has gone by with work still on it.
 * The calendar renders the count as a chip and tints that chip on a date in
 * arrears, instead of the earlier binary "has tasks" dot.
 *
 * Pure and unit-tested here, then embedded into the webview via `.toString()`,
 * so these tests transitively cover the rendered chips. Keep it
 * self-contained: it may only touch its parameters, never module-scope imports
 * (the `DayAgenda` import is a type, erased at compile time and absent from
 * the `.toString()` body).
 */

export interface MonthCellCounts {
    /** Tasks dated to this date -- the scheduled buckets, and nothing else. */
    total: number;
    /** The date has gone by with planned work still on it. */
    overdue: boolean;
}

/** Date (`YYYY-MM-DD`) -> counts, for every date the payload carries tasks on. */
export type MonthDayIndex = Record<string, MonthCellCounts>;

/** One cell of the month grid, in the order the grid lays them out. */
export interface MonthCell {
    /** The date the cell drills down into (`YYYY-MM-DD`), padding days included. */
    date: string;
    /** The number printed in the cell -- the day of its own month. */
    dayNumber: number;
    /** A padding day from the previous or next month. */
    otherMonth: boolean;
    /** Saturday or Sunday. Public holidays are a separate, payload-driven mark. */
    weekend: boolean;
    /** The cell for today, wherever the anchor sits. */
    today: boolean;
}

/**
 * Lay out the month the anchor falls in: the leading padding days from the
 * previous month, the month itself, then enough trailing days to finish the
 * last week. That is what gives the grid its natural 4/5/6 rows.
 *
 * `firstOffset` is 0 for a Sunday-first week and 1 for a Monday-first one (see
 * `resolveFirstDayOffset`). Padding cells carry a real date because they drill
 * down into the Day view like every other cell.
 */
export function buildMonthGrid(anchorIso: string, firstOffset: number, todayIso: string): MonthCell[] {
    const columns = 7;
    // Local time throughout: the grid marks the user's today, not UTC's.
    const iso = (d: Date): string => {
        const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const year = Number(anchorIso.slice(0, 4));
    const month = Number(anchorIso.slice(5, 7)) - 1;
    const cell = (d: Date, otherMonth: boolean): MonthCell => {
        const date = iso(d);
        const weekday = d.getDay();
        return {
            date,
            dayNumber: d.getDate(),
            otherMonth,
            weekend: weekday === 0 || weekday === 6,
            today: date === todayIso
        };
    };

    // getDay(): 0=Sun..6=Sat, converted to the count of leading padding cells.
    const startDay = (new Date(year, month, 1).getDay() - firstOffset + columns) % columns;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: MonthCell[] = [];
    for (let i = startDay; i > 0; i--) {
        cells.push(cell(new Date(year, month, 1 - i), true));
    }
    for (let day = 1; day <= daysInMonth; day++) {
        cells.push(cell(new Date(year, month, day), false));
    }
    const trailing = (columns - ((startDay + daysInMonth) % columns)) % columns;
    for (let i = 1; i <= trailing; i++) {
        cells.push(cell(new Date(year, month + 1, i), true));
    }
    return cells;
}

/**
 * Index a month payload by date, as of `todayIso`. Dates with no tasks are
 * omitted, so the renderer can treat a missing key as "empty day". Month
 * payloads may omit empty buckets entirely (see `DayAgenda` docs), hence the
 * defensive array checks.
 *
 * Only the scheduled buckets are counted. The extractor files a task under the
 * day it is dated to *and* repeats it under today -- as arrears in `overdue`,
 * or as a deadline coming up in `upcoming` -- so counting those buckets counted
 * the same task twice: once in its own cell, once in today's. The chip is
 * tinted from the cell's own date instead: it has gone by, and something
 * planned is still sitting on it. Only the planning keywords leave a debt
 * behind, as the extractor has it (`keeps_a_missed_date`) -- a meeting that has
 * been and gone is not one.
 */
export function buildMonthDayIndex(days: DayAgenda[], todayIso: string): MonthDayIndex {
    const index: MonthDayIndex = {};
    const list = Array.isArray(days) ? days : [];
    for (const day of list) {
        if (!day.date) {
            continue;
        }
        // Inlined (not a module-scope helper) so the whole function survives
        // the `.toString()` injection into the webview.
        const bucket = (name: 'scheduled_timed' | 'scheduled_no_time'): TaskWithOffset[] =>
            Array.isArray(day[name]) ? day[name] : [];
        const dated = [...bucket('scheduled_timed'), ...bucket('scheduled_no_time')];
        if (dated.length > 0) {
            const owes = dated.some((t) => t.timestamp_type === 'SCHEDULED' || t.timestamp_type === 'DEADLINE');
            index[day.date] = { total: dated.length, overdue: day.date < todayIso && owes };
        }
    }
    return index;
}
