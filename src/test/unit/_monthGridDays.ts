import type { DayAgenda } from '../../types';

/**
 * The days `--agenda month-grid` answers with: consecutive dates from `first`,
 * empty of tasks. The extractor decides which dates those are (whole weeks
 * around the anchor month, beginning on `--week-start`); a test that lays out
 * or renders a grid only needs them in that order, so it names the first date
 * and how many follow.
 */
export function monthGridDays(first: string, count: number): DayAgenda[] {
    const start = new Date(`${first}T00:00:00`);
    const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
    const days: DayAgenda[] = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        days.push({
            date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            overdue: [],
            scheduled_timed: [],
            scheduled_no_time: [],
            upcoming: []
        });
    }
    return days;
}
