export interface OrgTimestampOptions {
    /** Source date; all fields are read in local time (no UTC), per ADR-0007. */
    date: Date;
    /** `angle` emits `<...>` (active), `square` emits `[...]` (inactive). */
    bracket: 'angle' | 'square';
    /** Pre-formatted weekday token; omitted from the output when falsy. */
    weekday?: string;
    /** Append ` HH:MM` (default `true`); set `false` for date-only timestamps. */
    includeTime?: boolean;
    /** Org repeater (e.g. `+1d`); appended after the time when non-empty. */
    repeater?: string;
}

/**
 * Assemble an org-mode timestamp string `<YYYY-MM-DD Day HH:MM +rep>` (or the
 * inactive `[...]` form) from a `Date` and the optional tokens around it.
 *
 * This is the single place that fixes the digit widths -- year padded to four,
 * month/day/hour/minute to two -- so callers (`formatOrgTimestamp`,
 * `incrementTimestamp`, `adjustClockTimestamp`) cannot drift apart on padding.
 * The weekday is passed in already localized; this builder never derives it.
 */
export function buildOrgTimestamp(opts: OrgTimestampOptions): string {
    const { date, bracket, weekday, includeTime = true, repeater } = opts;
    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const open = bracket === 'angle' ? '<' : '[';
    const close = bracket === 'angle' ? '>' : ']';

    let result = `${open}${year}-${month}-${day}`;
    if (weekday) {
        result += ` ${weekday}`;
    }
    if (includeTime) {
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');
        result += ` ${hour}:${minute}`;
    }
    if (repeater) {
        result += ` ${repeater}`;
    }
    return result + close;
}
