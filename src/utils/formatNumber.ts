/**
 * Format an integer in the locale's numbering system, ungrouped.
 *
 * The agenda prints dates through `Intl`, so in a locale with non-Latin digits
 * (ar-EG and friends) a raw JS number lands next to Arabic-Indic ones: the hero
 * subtitle read "٥ يناير 2026" while the day header below it was fully
 * localised. Grouping is off because every number this formats -- a year, a day
 * of the month, a task count -- is an identifier or a small count, not a
 * quantity that wants thousands separators.
 *
 * Inlined into the webview via `.toString()`, so the body must stand alone: no
 * imports, no module-level constants, no sibling helpers.
 */
export function formatNumber(value: number, locale: string): string {
    try {
        return new Intl.NumberFormat(locale || undefined, { useGrouping: false }).format(value);
    } catch {
        // An invalid locale tag ("ru_RU") throws a RangeError. On the page that
        // would take the whole render down, so fall back to the host default.
        return new Intl.NumberFormat(undefined, { useGrouping: false }).format(value);
    }
}
