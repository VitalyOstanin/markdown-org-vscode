/**
 * Render an extractor date (`YYYY-MM-DD`) the way the configured locale writes
 * a numeric date: `12.08.2026` for `ru-RU`, `08/12/2026` for `en-US`.
 *
 * The agenda used to build this string by hand (`day + '.' + month + '.' + year`),
 * which meant the offset column and the flag tooltips showed a day-first order
 * to every user, including the ones whose other dates -- the hero title, the day
 * headers, the calendar weekday names -- were already formatted through `Intl`.
 * Two orders in one panel is worse than either.
 *
 * Fixed-width fields (`2-digit`) are deliberate: the offset column is a column,
 * and a jumping width would make it ragged.
 *
 * Inlined into the webview via `.toString()`, so it stays self-contained: no
 * module-level imports, and an unusable locale tag degrades to the runtime
 * default rather than throwing (see utils/dateLocale.ts for the host-side
 * validation of the setting).
 */
export function formatIsoDate(iso: string, locale: string): string {
    const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!parts) {
        // Not a date we recognise: pass it through rather than inventing one.
        return iso || '';
    }
    const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
    try {
        return new Intl.DateTimeFormat(locale || undefined, options).format(date);
    } catch {
        return new Intl.DateTimeFormat(undefined, options).format(date);
    }
}
