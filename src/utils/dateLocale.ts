/**
 * Validation for `markdown-org.dateLocale`.
 *
 * The setting is a free-form string ("en-US", "ru-RU", "de-DE"), and a
 * syntactically invalid tag is not a soft failure: `new Intl.DateTimeFormat('ru_RU')`
 * throws a RangeError rather than falling back. That value reaches the agenda
 * webview and every date it formats, so an underscore instead of a hyphen -- a
 * realistic typo -- used to take the whole panel down with it.
 *
 * The host checks the tag once, before it is handed to the webview, and falls
 * back to English while naming the rejected value.
 */

/** Locale used when the configured one is unusable. */
export const FALLBACK_DATE_LOCALE = 'en-US';

/** True when `Intl` accepts the tag, i.e. it is safe to format dates with. */
export function isUsableDateLocale(locale: string): boolean {
    try {
        new Intl.DateTimeFormat(locale);
        return true;
    } catch {
        return false;
    }
}

/**
 * The locale to format with, plus the rejected value when there was one.
 *
 * An empty or missing setting is not a rejection -- it simply means "use the
 * default" -- so it comes back without `rejected` and produces no warning.
 */
export function resolveDateLocale(configured: string | undefined | null): { locale: string; rejected?: string } {
    const trimmed = (configured ?? '').trim();
    if (!trimmed) {
        return { locale: FALLBACK_DATE_LOCALE };
    }
    if (isUsableDateLocale(trimmed)) {
        return { locale: trimmed };
    }
    return { locale: FALLBACK_DATE_LOCALE, rejected: trimmed };
}
