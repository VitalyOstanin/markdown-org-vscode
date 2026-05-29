export const CLOCK_REGEX =
    /^(?<indent>\s*)`CLOCK: (?<startOpenBracket>[[<])(?<startYear>\d{4})-(?<startMonth>\d{2})-(?<startDay>\d{2}) (?<startBody>[^\]>]+)(?<startCloseBracket>[\]>])(?:--(?<endOpenBracket>[[<])(?<endYear>\d{4})-(?<endMonth>\d{2})-(?<endDay>\d{2}) (?<endBody>[^\]>]+)(?<endCloseBracket>[\]>]) => +(?<durationHours>-?\d+):(?<durationMinutes>-?\d+))?`$/;

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
    const m = text.match(TIMESTAMP_LINE_REGEX);
    if (!m?.groups) return null;
    const indent = m.groups.indent;
    if (m.groups.schedTs) return { indent, type: 'SCHEDULED', timestamp: m.groups.schedTs, active: true };
    if (m.groups.deadTs) return { indent, type: 'DEADLINE', timestamp: m.groups.deadTs, active: true };
    if (m.groups.closedTs) return { indent, type: 'CLOSED', timestamp: m.groups.closedTs, active: false };
    if (m.groups.createdTs) return { indent, type: 'CREATED', timestamp: m.groups.createdTs, active: false };
    return null;
}

// Priority cookie accepts the same shape that markdown-org-extract recognizes
// (its `HEADING_PRIORITY_RE`, src/parser.rs): a single uppercase A-Z, or a
// non-leading-zero decimal in 0..=64. The numeric alternatives are ordered
// long-to-short so the regex engine never matches `6` before `64` or `1`
// before `12`.
export const HEADING_REGEX =
    /^(?<hashes>#+)\s+(?:(?<status>TODO|DONE|CANCELLED)\s+)?(?:\[#(?<priority>[A-Z]|6[0-4]|[1-5][0-9]|[0-9])\]\s+)?(?<title>.+)$/;
