export const CLOCK_REGEX =
    /^(?<indent>\s*)`CLOCK: (?<startOpenBracket>[[<])(?<startYear>\d{4})-(?<startMonth>\d{2})-(?<startDay>\d{2}) (?<startBody>[^\]>]+)(?<startCloseBracket>[\]>])(?:--(?<endOpenBracket>[[<])(?<endYear>\d{4})-(?<endMonth>\d{2})-(?<endDay>\d{2}) (?<endBody>[^\]>]+)(?<endCloseBracket>[\]>]) => +(?<durationHours>-?\d+):(?<durationMinutes>-?\d+))?`$/;

export const TIMESTAMP_LINE_REGEX =
    /^(?<indent>\s*)`(?<type>CREATED|SCHEDULED|DEADLINE|CLOSED): (?<timestamp><[^>]+>)`$/;

export const HEADING_REGEX =
    /^(?<hashes>#+)\s+(?:(?<status>TODO|DONE)\s+)?(?:\[#(?<priority>[A-Z])\]\s+)?(?<title>.+)$/;
