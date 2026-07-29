// Whitespace acceptance mirrors markdown-org-extract's `CLOCK_RE` (clock.rs):
// `CLOCK:\s*` before the first timestamp and `\s*=>\s*` around the duration
// arrow. Both projects read the same lines off disk, so a line one of them
// counts and the other silently skips would make `total_clock_time` and the
// clocktable built here disagree about the same file. The extension always
// writes the canonical single-space form; this is about what it accepts.
export const CLOCK_REGEX =
    /^(?<indent>\s*)`CLOCK:\s*(?<startOpenBracket>[[<])(?<startYear>\d{4})-(?<startMonth>\d{2})-(?<startDay>\d{2}) (?<startBody>[^\]>]+)(?<startCloseBracket>[\]>])(?:--(?<endOpenBracket>[[<])(?<endYear>\d{4})-(?<endMonth>\d{2})-(?<endDay>\d{2}) (?<endBody>[^\]>]+)(?<endCloseBracket>[\]>])\s*=>\s*(?<durationHours>-?\d+):(?<durationMinutes>-?\d+))?`$/;

// Strict per-keyword bracket policy from ADR-0014:
//   SCHEDULED, DEADLINE -> active <...>
//   CLOSED, CREATED     -> inactive [...]
// Any other combination (CLOSED: <...>, SCHEDULED: [...], mixed pairs)
// is intentionally not matched by this regex. Editing flows fall back
// to bare-timestamp handling, and the diagnostics layer (Quick Fix)
// reports the violation. Use `matchTimestampLine` below for a typed,
// unified shape that hides the per-keyword alternation.
export const TIMESTAMP_LINE_REGEX =
    /^(?<indent>\s*)`(?:SCHEDULED: (?<schedTs><[^>]+>)|DEADLINE: (?<deadTs><[^>]+>)|CLOSED: (?<closedTs>\[[^\]]+\])|CREATED: (?<createdTs>\[[^\]]+\]))`$/;

export type TimestampLineKeyword = 'SCHEDULED' | 'DEADLINE' | 'CLOSED' | 'CREATED';

export interface TimestampLineMatch {
    indent: string;
    type: TimestampLineKeyword;
    timestamp: string;
    /** `true` for SCHEDULED/DEADLINE (<...>), `false` for CLOSED/CREATED ([...]). */
    active: boolean;
}

export function matchTimestampLine(text: string): TimestampLineMatch | null {
    const m = TIMESTAMP_LINE_REGEX.exec(text);
    if (!m?.groups) return null;
    const { indent, schedTs, deadTs, closedTs, createdTs } = m.groups;
    if (schedTs) return { indent: indent ?? '', type: 'SCHEDULED', timestamp: schedTs, active: true };
    if (deadTs) return { indent: indent ?? '', type: 'DEADLINE', timestamp: deadTs, active: true };
    if (closedTs) return { indent: indent ?? '', type: 'CLOSED', timestamp: closedTs, active: false };
    if (createdTs) return { indent: indent ?? '', type: 'CREATED', timestamp: createdTs, active: false };
    return null;
}

// Priority cookie accepts the same shape that markdown-org-extract recognizes
// (its `HEADING_PRIORITY_RE`, src/parser.rs): a single uppercase A-Z, or a
// non-leading-zero decimal in 0..=64. The numeric alternatives are ordered
// long-to-short so the regex engine never matches `6` before `64` or `1`
// before `12`. The space after the cookie is optional there, so it is optional
// here as well -- otherwise `[#A]Title` shows a priority in the agenda while
// the commands on the same line see none and offer to add a second cookie.
//
// One difference is left standing on purpose: the extractor matches a cookie
// ANYWHERE in the heading text, this pattern only right after the keyword.
// Accepting it anywhere would mean rewriting the line from the captured parts
// and moving the user's cookie to the front, which is a heavier change than a
// grammar fix -- it belongs with the shared parser tracked in TODO.md.
export const HEADING_REGEX =
    /^(?<hashes>#+)\s+(?:(?<status>TODO|DONE|CANCELLED|CANCELED)\s+)?(?:\[#(?<priority>[A-Z]|6[0-4]|[1-5][0-9]|[0-9])\]\s*)?(?<title>.+)$/;
