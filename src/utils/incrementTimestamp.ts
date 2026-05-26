import { buildOrgTimestamp } from './orgTimestamp';
import { TimestampPart } from './timestampParts';
import { DAY_NAMES_SHORT_RU, DAY_NAMES_SHORT_EN, DAY_NAMES_FULL_RU, DAY_NAMES_FULL_EN } from './dayNames';

/**
 * Shift a single part of a parsed timestamp by `delta` (+1 for Shift+Up, -1 for
 * Shift+Down) and re-render it. vscode-free so it can be unit-tested directly
 * against the `RegExpMatchArray` that `getTimestampPartAt` produces at runtime.
 *
 * Date math goes through `Date`, so out-of-range results normalize exactly like
 * Emacs `encode-time`: incrementing the month of 2026-05-31 builds
 * "2026-06-31", which has no such day and rolls forward to 2026-07-01 (June is
 * "skipped"). This is intentional org-mode parity -- org's `org-timestamp-change`
 * does the same and does NOT clamp to the last day of the target month. See the
 * memory note reference-timestamp-month-overflow.
 */
export function incrementTimestamp(
    match: RegExpMatchArray,
    part: TimestampPart,
    delta: number,
    active: boolean
): string {
    const g = match.groups!;
    const year = parseInt(g.year, 10);
    const month = parseInt(g.month, 10);
    const day = parseInt(g.day, 10);
    const weekday = g.weekday || '';
    const hour = g.hour ? parseInt(g.hour, 10) : undefined;
    const minute = g.minute ? parseInt(g.minute, 10) : undefined;
    const repeater = g.repeater || '';

    const date = new Date(year, month - 1, day, hour ?? 0, minute ?? 0);

    switch (part) {
        case 'year':
            date.setFullYear(date.getFullYear() + delta);
            break;
        case 'month':
            date.setMonth(date.getMonth() + delta);
            break;
        case 'day':
        case 'weekday':
            date.setDate(date.getDate() + delta);
            break;
        case 'hour':
            date.setHours(date.getHours() + delta);
            break;
        case 'minute':
            date.setMinutes(date.getMinutes() + delta);
            break;
    }

    const newWeekday = weekday ? getWeekdayName(date, weekday) : '';

    return buildOrgTimestamp({
        date,
        bracket: active ? 'angle' : 'square',
        weekday: newWeekday || undefined,
        includeTime: hour !== undefined && minute !== undefined,
        repeater: repeater || undefined
    });
}

/**
 * Pick the weekday name for `date` in the same language and length as
 * `originalFormat` (the weekday token already present in the timestamp): Russian
 * vs English by script, short vs full by token length.
 */
export function getWeekdayName(date: Date, originalFormat: string): string {
    const isRussian = /[А-Яа-я]/.test(originalFormat);
    const isFull = originalFormat.length > 3;
    const dayIndex = date.getDay();

    if (isRussian) {
        const days = isFull ? DAY_NAMES_FULL_RU : DAY_NAMES_SHORT_RU;
        return days[dayIndex];
    } else {
        const days = isFull ? DAY_NAMES_FULL_EN : DAY_NAMES_SHORT_EN;
        return days[dayIndex];
    }
}
