/**
 * Module-scope holiday cache shared across showAgenda invocations.
 *
 * Holidays are looked up via the extractor (`--holidays <year>`) once per
 * year and reused while the entry is fresh. The cache is intentionally a
 * module singleton so that closing and reopening the agenda webview does
 * not trigger a fresh extractor spawn for each year.
 *
 * A TTL is included so a user who upgrades the extractor binary mid-session
 * eventually sees its new holiday data without restarting VS Code.
 */

export type HolidaysFetcher = (year: number) => Promise<string[]>;

interface Entry {
    value: string[];
    expiresAt: number;
}

const cache = new Map<number, Entry>();

export const DEFAULT_HOLIDAYS_TTL_MS = 60 * 60 * 1000;

export async function getCachedHolidays(
    year: number,
    fetcher: HolidaysFetcher,
    now: () => number = Date.now,
    ttlMs: number = DEFAULT_HOLIDAYS_TTL_MS
): Promise<string[]> {
    const entry = cache.get(year);
    if (entry && entry.expiresAt > now()) {
        return entry.value;
    }
    const value = await fetcher(year);
    cache.set(year, { value, expiresAt: now() + ttlMs });
    return value;
}

export function clearHolidaysCache(): void {
    cache.clear();
}
