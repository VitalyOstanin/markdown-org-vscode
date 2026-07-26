/**
 * Whether `value` is a `YYYY-MM-DD` string naming a real calendar day.
 *
 * The agenda webview posts an anchor date back to the extension, which hands
 * it to `markdown-org-extract` as `--date`. The value is checked here rather
 * than forwarded verbatim: the shape must match what the CLI accepts, and a
 * well-formed but impossible day (`2026-02-30`) would only surface as an
 * extractor error much later.
 */
export function isIsoDate(value: string | undefined | null): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    // Round-trip guards against overflow: `new Date(2026, 1, 30)` silently
    // becomes March 2, so a mismatch means the input named no such day.
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Format a Date as a local `YYYY-MM-DD` string (no timezone conversion). */
export function toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
