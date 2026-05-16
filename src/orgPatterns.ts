export const CLOCK_REGEX = /^(\s*)`CLOCK: ([\[<])(\d{4})-(\d{2})-(\d{2}) ([^\]>]+)([\]>])(?:--([\[<])(\d{4})-(\d{2})-(\d{2}) ([^\]>]+)([\]>]) => +(-?\d+):(-?\d+))?`$/;

export const TIMESTAMP_LINE_REGEX = /^(\s*)`(CREATED|SCHEDULED|DEADLINE|CLOSED): <[^>]+>`$/;

export const HEADING_REGEX = /^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/;
