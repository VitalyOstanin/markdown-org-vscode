/**
 * Localized pieces of an agenda day header, split so the webview can place
 * each into its own grid column (weekday | day | month+year).
 */
export interface DayHeaderParts {
    weekday: string;
    day: string;
    month: string;
    year: string;
}

/**
 * Build the localized parts of an agenda day header from an ISO
 * `YYYY-MM-DD` date string.
 *
 * The day and month are taken from `Intl.DateTimeFormat#formatToParts` by
 * token *type*, never by string position. Reading by position broke on
 * locales whose day/month order or separators differ from "<day> <month>":
 * en-US renders "January 5" (so a positional `split(' ')[0]` returned the
 * month) and ja-JP renders "1月5日" with no separating space.
 *
 * Using the combined `{ day, month }` format (rather than two separate
 * single-field calls) preserves the grammatical form a locale uses when day
 * and month appear together -- e.g. Russian genitive "5 января", not the
 * nominative "январь" that a standalone `{ month: 'long' }` produces.
 *
 * Dates are parsed in local time (local midnight); there is no UTC
 * conversion, matching the project-wide wall-clock convention (see
 * ADR-0007).
 *
 * Known limitation: for CJK locales that suffix the numeric month (ja-JP
 * "1月"), `formatToParts` puts the suffix in a `literal` token, so `month`
 * is the bare number ("1"). This is an accepted trade-off -- ja-JP is
 * outside the project's target locales (ru/en) and the result is still far
 * better than the previous behavior, which dropped the month entirely.
 */
export function formatDayHeaderParts(dateStr: string, locale: string): DayHeaderParts {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const dayMonthParts = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long'
    }).formatToParts(date);
    const dayValue = dayMonthParts.find((p) => p.type === 'day')?.value ?? '';
    const monthValue = dayMonthParts.find((p) => p.type === 'month')?.value ?? '';

    return {
        weekday: date.toLocaleDateString(locale, { weekday: 'long' }),
        day: dayValue,
        month: monthValue,
        year: date.toLocaleDateString(locale, { year: 'numeric' })
    };
}
