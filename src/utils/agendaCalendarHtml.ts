/**
 * HTML for the month calendar, plus the two locale decisions it rests on:
 * which weekday the grid starts on and what the column headers are called.
 *
 * Same split as agendaSummaryHtml.ts / agendaNavHtml.ts: the grid layout lives
 * in agendaMonthCells.ts (`buildMonthGrid`), the markup lives here, and both
 * take their state as parameters instead of reading the client's scope -- the
 * page runs in a webview no coverage runner instruments, so anything that reads
 * that scope is untestable.
 *
 * Inlined into the page through `Function.prototype.toString()`: a body may
 * only touch its own parameters and functions defined in this module. No value
 * imports -- a cross-module call compiles to `module_1.fn`, undefined in the
 * page.
 */
import type { OverdueBandIndex } from './agendaDaySummary';
import type { MonthCell, MonthDayIndex } from './agendaMonthCells';
import type { EscapeHtml, FormatNumber, FormatString, PluralIndex } from './agendaSummaryHtml';

/** `Intl.Locale.weekInfo` is not in the ES2022 lib yet, but browsers ship it. */
interface LocaleWithWeekInfo {
    weekInfo?: { firstDay?: number };
}

/**
 * 0 for a Sunday-first week, 1 for a Monday-first one. The setting wins; on
 * `auto` the locale's own `weekInfo` decides, and anything it cannot answer
 * falls back to Monday.
 */
export function resolveFirstDayOffset(firstDayOfWeek: string, locale: string): number {
    if (firstDayOfWeek === 'sunday') {
        return 0;
    }
    if (firstDayOfWeek === 'monday') {
        return 1;
    }
    try {
        const info = (new Intl.Locale(locale) as unknown as LocaleWithWeekInfo).weekInfo;
        if (info?.firstDay === 7) {
            return 0;
        }
        if (info?.firstDay !== undefined && info.firstDay >= 1 && info.firstDay <= 6) {
            return 1;
        }
    } catch {
        // Unsupported locale or API -- fall through to the Monday default.
    }
    return 1;
}

/** The two week starts the setting resolves to, as the extractor names them. */
export type ResolvedWeekStart = 'monday' | 'sunday';

/**
 * The weekday the grid begins on, for `--agenda month-grid --week-start`.
 *
 * The extractor takes a weekday and no `auto`: it reads no locale of its own
 * and its default is a fixed Monday, so `auto` has to be answered here, where
 * the locale is known. Resolving it once, in the extension host, is also what
 * keeps the grid honest -- the same value picks the dates the extractor sends
 * and the column headers the page prints over them.
 */
export function resolveWeekStart(firstDayOfWeek: string, locale: string): ResolvedWeekStart {
    return resolveFirstDayOffset(firstDayOfWeek, locale) === 0 ? 'sunday' : 'monday';
}

/** Column headers, in grid order. */
export function buildWeekdayLabels(firstOffset: number, locale: string): string[] {
    const columns = 7;
    // A reference week starting Sun 2024-01-07 turns a column index into a
    // weekday name without touching the month being rendered.
    const labels: string[] = [];
    for (let i = 0; i < columns; i++) {
        labels.push(
            new Date(2024, 0, 7 + ((i + firstOffset) % columns)).toLocaleDateString(locale, { weekday: 'short' })
        );
    }
    return labels;
}

/**
 * Opening tag of a calendar cell. Every cell -- the padding days of the
 * neighbouring months included -- drills down into the Day view, the same
 * operation the week day-header offers, so all of them are buttons and all
 * carry that header's tooltip.
 */
export function calendarCellOpenTag(
    classes: string,
    dateStr: string,
    ctx: { openDayView: string; escapeHtml: EscapeHtml }
): string {
    return `<button type="button" class="${classes}" data-date="${dateStr}" title="${ctx.escapeHtml(ctx.openDayView)}">`;
}

/**
 * The month grid: a row of column headers followed by one button per cell.
 * Task load is a count chip rather than a binary dot -- the number says how
 * full the day is at a glance, and the chip turns red when any of that day's
 * work is overdue.
 */
export function renderMonthCalendar(
    cells: readonly MonthCell[],
    weekdayLabels: readonly string[],
    ctx: {
        locale: string;
        uiLang: string;
        openDayView: string;
        taskChipForms: string[];
        /** Says the day is overdue; no count, because the chip is the count. */
        overdueChipLabel: string;
        /** Says a deadline falls on this day and is close enough to warn about. */
        dueChipLabel: string;
        index: MonthDayIndex;
        /**
         * Date -> its overdue bands (see `buildOverdueBandIndex`), which the
         * chip's tooltip spells out. A date missing from it says its overdue
         * count without a breakdown, which is what an older payload gives.
         */
        bands: OverdueBandIndex;
        isHoliday: (date: string) => boolean;
        escapeHtml: EscapeHtml;
        formatString: FormatString;
        formatNumber: FormatNumber;
        pluralIndex: PluralIndex;
        countLabel: (
            n: number,
            forms: string[],
            ctx: { locale: string; uiLang: string; formatNumber: FormatNumber; pluralIndex: PluralIndex }
        ) => string;
    }
): string {
    const headers = weekdayLabels
        .map((label) => `<div class="calendar-header">${ctx.escapeHtml(label)}</div>`)
        .join('');
    const body = cells
        .map((cell) => {
            const counts = ctx.index[cell.date];
            let classes = 'calendar-day';
            if (cell.otherMonth) {
                classes += ' other-month';
            }
            if (cell.weekend) {
                classes += ' weekend';
            }
            if (ctx.isHoliday(cell.date)) {
                classes += ' holiday';
            }
            if (counts) {
                classes += ' has-tasks';
            }
            if (cell.today) {
                classes += ' today';
            }

            let chip = '';
            if (counts) {
                const overdueSuffix = counts.overdue ? `, ${ctx.overdueChipLabel}` : '';
                // What that overdue day is made of, named band by band. The
                // grid has no room for the bands themselves, and a red 6 reads
                // the same whether it is six repeats missed this week or six
                // dates from three years ago -- which are not the same day.
                const bands = ctx.bands[cell.date] ?? [];
                const breakdown =
                    counts.overdue && bands.length > 0
                        ? ` (${bands
                              .map((band) => `${band.title}: ${ctx.formatNumber(band.count, ctx.locale)}`)
                              .join(', ')})`
                        : '';
                // A date still ahead that a deadline's warning window has
                // reached. Overdue wins the chip: once the date has gone by,
                // what it is owed matters more than what it was due.
                const dueSuffix = !counts.overdue && counts.dueSoon ? `, ${ctx.dueChipLabel}` : '';
                const title = ctx.escapeHtml(
                    ctx.countLabel(counts.total, ctx.taskChipForms, ctx) + overdueSuffix + dueSuffix + breakdown
                );
                const overdueClass = counts.overdue ? ' task-count-overdue' : '';
                const dueClass = !counts.overdue && counts.dueSoon ? ' task-count-due' : '';
                chip =
                    `<div class="task-count${overdueClass}${dueClass}" title="${title}">` +
                    `${ctx.escapeHtml(ctx.formatNumber(counts.total, ctx.locale))}</div>`;
            }

            return (
                calendarCellOpenTag(classes, cell.date, ctx) +
                `<div class="day-number">${ctx.escapeHtml(ctx.formatNumber(cell.dayNumber, ctx.locale))}</div>` +
                chip +
                '</button>'
            );
        })
        .join('');
    return `<div class="calendar">${headers}${body}</div>`;
}
