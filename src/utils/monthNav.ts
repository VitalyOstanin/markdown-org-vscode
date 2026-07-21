/**
 * Shift a month-view anchor date by `offset` whole months, robust to the
 * short-month rollover bug.
 *
 * A naive `d.setMonth(d.getMonth() + offset)` keeps the anchor's day-of-month:
 * from Jan 31, `setMonth(+1)` lands on "Feb 31", which JavaScript rolls over to
 * Mar 2/3, so February is skipped entirely. Anchoring to day 1 of the target
 * month (`new Date(year, month + offset, 1)`) avoids that: month arithmetic on
 * day 1 never overflows into the next month.
 *
 * Returns a new Date at local midnight of the first day of the target month.
 * Shared with the webview via `.toString()` inlining in agendaPanel.ts and
 * unit-tested here.
 */
export function shiftMonthAnchor(date: Date, offset: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + offset, 1, 0, 0, 0, 0);
}
