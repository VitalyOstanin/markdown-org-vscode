// Acceptance mirrors markdown-org-extract's `CLOCK_RE` (clock.rs) in three
// respects. Whitespace: `CLOCK:\s*` before the first timestamp and `\s*=>\s*`
// around the duration arrow. Brackets: the opening and closing one of each
// timestamp are alternatives of a pair, so `[…>` and `<…]` are rejected, and a
// body never contains a bracket of either kind. Duration: the `=> H:MM` tail is
// optional even on a closed entry -- org-mode writes it but does not require
// it. Both projects read the same lines off disk, so a line one of them counts
// and the other silently skips would make `total_clock_time` and the clocktable
// built here disagree about the same file. The extension always writes the
// canonical single-space form; this is about what it accepts.
//
// The alternatives repeat their group names, which is how each pair reports the
// same fields whichever bracket it uses.
export const CLOCK_REGEX =
    /^(?<indent>\s*)`CLOCK:\s*(?:(?<startOpenBracket>\[)(?<startYear>\d{4})-(?<startMonth>\d{2})-(?<startDay>\d{2}) (?<startBody>[^\][<>]+)(?<startCloseBracket>\])|(?<startOpenBracket><)(?<startYear>\d{4})-(?<startMonth>\d{2})-(?<startDay>\d{2}) (?<startBody>[^\][<>]+)(?<startCloseBracket>>))(?:--(?:(?<endOpenBracket>\[)(?<endYear>\d{4})-(?<endMonth>\d{2})-(?<endDay>\d{2}) (?<endBody>[^\][<>]+)(?<endCloseBracket>\])|(?<endOpenBracket><)(?<endYear>\d{4})-(?<endMonth>\d{2})-(?<endDay>\d{2}) (?<endBody>[^\][<>]+)(?<endCloseBracket>>)))?(?:\s*=>\s*(?<durationHours>-?\d+):(?<durationMinutes>-?\d+))?`$/;

/**
 * A line that says CLOCK but is not one -- a malformed bracket pair, a body
 * with a stray bracket, a truncated timestamp.
 *
 * Used to keep such a line from ending the walk over a heading's CLOCK block.
 * The extractor has no notion of a block at all: it sweeps the file for CLOCK
 * lines, so one bad line costs it that line and nothing more. Here the block
 * ends at the first line that is not part of it, and without this a typo in the
 * first entry hid every entry under the same heading.
 */
export const CLOCK_LINE_LOOKALIKE_REGEX = /^\s*`CLOCK:/;

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
// The `priority` group covers only the canonical position -- right after the
// keyword -- because that is the cookie the extractor takes out of the heading
// text (its ADR-0027). A cookie written further along counts for the priority
// there as well, but stays inside the title, and so it does here: it lands in
// `title` rather than in `priority`, and the two projects agree on what the
// heading says. Use `findPriorityCookie` to locate it.
export const HEADING_REGEX =
    /^(?<hashes>#+)\s+(?:(?<status>TODO|DONE|CANCELLED|CANCELED)\s+)?(?:\[#(?<priority>[A-Z]|6[0-4]|[1-5][0-9]|[0-9])\]\s*)?(?<title>.+)$/;

// The cookie on its own, for finding one inside a title. Same accepted values
// as above, so `[#65]` and `[#01]` are text in both places rather than a
// priority here and text there.
const PRIORITY_COOKIE_REGEX = /\[#(?<priority>[A-Z]|6[0-4]|[1-5][0-9]|[0-9])\]/;

/** Where a priority cookie sits inside `text`, and what it says. */
export interface PriorityCookie {
    /** Bare value, e.g. `A` or `12`. */
    value: string;
    /** Byte offsets of the cookie itself, framing included. */
    start: number;
    end: number;
}

/**
 * The first priority cookie in `text`, wherever it is.
 *
 * Mirrors the extractor's reading: a cookie counts for the priority no matter
 * where it was typed. Callers that also need to know whether it is in the
 * canonical position compare `start` against the start of the title.
 */
export function findPriorityCookie(text: string): PriorityCookie | undefined {
    const match = PRIORITY_COOKIE_REGEX.exec(text);
    const value = match?.groups?.priority;
    if (!match || value === undefined) {
        return undefined;
    }
    return { value, start: match.index, end: match.index + match[0].length };
}
