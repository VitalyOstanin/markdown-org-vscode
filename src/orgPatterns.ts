export const CLOCK_REGEX =
    /^(?<indent>\s*)`CLOCK: (?<startOpenBracket>[[<])(?<startYear>\d{4})-(?<startMonth>\d{2})-(?<startDay>\d{2}) (?<startBody>[^\]>]+)(?<startCloseBracket>[\]>])(?:--(?<endOpenBracket>[[<])(?<endYear>\d{4})-(?<endMonth>\d{2})-(?<endDay>\d{2}) (?<endBody>[^\]>]+)(?<endCloseBracket>[\]>]) => +(?<durationHours>-?\d+):(?<durationMinutes>-?\d+))?`$/;

export const TIMESTAMP_LINE_REGEX =
    /^(?<indent>\s*)`(?<type>CREATED|SCHEDULED|DEADLINE|CLOSED): (?<timestamp><[^>]+>)`$/;

// Priority cookie accepts the same shape that markdown-org-extract recognizes
// (its `HEADING_PRIORITY_RE`, src/parser.rs): a single uppercase A-Z, or a
// non-leading-zero decimal in 0..=64. The numeric alternatives are ordered
// long-to-short so the regex engine never matches `6` before `64` or `1`
// before `12`.
export const HEADING_REGEX =
    /^(?<hashes>#+)\s+(?:(?<status>TODO|DONE)\s+)?(?:\[#(?<priority>[A-Z]|6[0-4]|[1-5][0-9]|[0-9])\]\s+)?(?<title>.+)$/;
