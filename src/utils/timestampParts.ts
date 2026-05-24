export type TimestampPart = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute';

export type ClockTimestampPart =
    | 'start-year'
    | 'start-month'
    | 'start-day'
    | 'start-weekday'
    | 'start-hour'
    | 'start-minute'
    | 'end-year'
    | 'end-month'
    | 'end-day'
    | 'end-weekday'
    | 'end-hour'
    | 'end-minute';

export interface TimestampPartHit {
    match: RegExpMatchArray;
    part: TimestampPart;
    start: number;
    end: number;
}

export interface ClockTimestampPartHit {
    match: RegExpMatchArray;
    part: ClockTimestampPart;
}

// Cursor-aware variant of TIMESTAMP_REGEX from orgPatterns: captures date parts
// as named groups so the position-to-part mapping below stays self-describing.
//
// Repeater syntax mirrors markdown-org-extract (src/timestamp/repeater.rs):
//   * prefix: `.+` (Restart) | `++` (CatchUp) | `+` (Cumulative)
//   * unit:   `wd` (Workday) | `d` | `w` | `m` | `y` | `h`
// Order inside the alternations matters: `.+` and `++` must come before `+`,
// `wd` must come before `d`, otherwise the engine commits to the shorter
// option and consumes a partial match.
const TIMESTAMP_REGEX =
    /<(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?: (?<weekday>[А-Яа-яA-Za-z]+))?(?: (?<hour>\d{2}):(?<minute>\d{2}))?(?: (?<repeater>(?:\.\+|\+\+|\+)\d+(?:wd|[dwmyh])))?>/;

const CLOCK_REGEX =
    /^(?<indent>\s*)`CLOCK: (?<startOpenBracket>[[<])(?<startYear>\d{4})-(?<startMonth>\d{2})-(?<startDay>\d{2}) (?<startWeekday>[А-Яа-яA-Za-z]+) (?<startHour>\d{2}):(?<startMinute>\d{2})(?<startCloseBracket>[\]>])(?:--(?<endOpenBracket>[[<])(?<endYear>\d{4})-(?<endMonth>\d{2})-(?<endDay>\d{2}) (?<endWeekday>[А-Яа-яA-Za-z]+) (?<endHour>\d{2}):(?<endMinute>\d{2})(?<endCloseBracket>[\]>]) => +(?<durationHours>-?\d+):(?<durationMinutes>-?\d+))?`$/;

interface Span {
    part: TimestampPart | ClockTimestampPart;
    start: number;
    end: number;
}

function inSpan(character: number, span: Span): boolean {
    return character >= span.start && character < span.end;
}

/**
 * Map a cursor position inside a line to the timestamp part it sits on.
 *
 * Internally each part owns a half-open span `[start, end)` over the
 * character columns. VS Code positions sit BETWEEN characters, so a cursor
 * shown "right after" a part visually lands on the separator that follows
 * it (e.g. column 22 in `<2026-05-25 Пн ...>` is the space immediately past
 * `25`). To match user intent we first probe `character`, then fall back to
 * `character - 1` -- staying within the same timestamp so an adjacent one
 * never picks up the position. Cursor on an opening `<`, or anywhere outside
 * a timestamp, returns `null`.
 *
 * If a line contains multiple timestamps, the one containing the cursor wins.
 */
export function getTimestampPartAt(lineText: string, character: number): TimestampPartHit | null {
    const regex = new RegExp(TIMESTAMP_REGEX, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
        if (!match.groups) continue;
        const tsStart = match.index;
        const tsEnd = tsStart + match[0].length;
        if (character < tsStart || character >= tsEnd) continue;

        const spans = buildTimestampSpans(lineText, match, tsStart);

        const direct = findPart(character, spans);
        if (direct) {
            return { match, part: direct as TimestampPart, start: tsStart, end: tsEnd };
        }
        if (character > tsStart) {
            const leftLeaning = findPart(character - 1, spans);
            if (leftLeaning) {
                return { match, part: leftLeaning as TimestampPart, start: tsStart, end: tsEnd };
            }
        }
        return null;
    }
    return null;
}

function buildTimestampSpans(lineText: string, match: RegExpExecArray, tsStart: number): Span[] {
    const { weekday, hour, minute } = match.groups!;
    const spans: Span[] = [
        { part: 'year', start: tsStart + 1, end: tsStart + 5 },
        { part: 'month', start: tsStart + 6, end: tsStart + 8 },
        { part: 'day', start: tsStart + 9, end: tsStart + 11 }
    ];

    let cursor = tsStart + 11;
    if (weekday) {
        const weekdayStart = lineText.indexOf(weekday, cursor);
        spans.push({ part: 'weekday', start: weekdayStart, end: weekdayStart + weekday.length });
        cursor = weekdayStart + weekday.length;
    }
    if (hour && minute) {
        const hourStart = lineText.indexOf(hour, cursor);
        spans.push({ part: 'hour', start: hourStart, end: hourStart + 2 });
        const minuteStart = hourStart + 3;
        spans.push({ part: 'minute', start: minuteStart, end: minuteStart + 2 });
    }

    return spans;
}

function findPart(character: number, spans: Span[]): Span['part'] | null {
    for (const span of spans) {
        if (inSpan(character, span)) return span.part;
    }
    return null;
}

/**
 * Map a cursor position inside a CLOCK line to the CLOCK timestamp part.
 *
 * Returns `null` if the line is not a CLOCK entry, or if the cursor sits
 * outside the start/end timestamps entirely. As with `getTimestampPartAt`,
 * a left-leaning fallback (`character - 1`) covers the visual "right after a
 * part" case where the cursor lands on `-`, `:`, ` `, `]`, `>` directly
 * adjacent to a part. The fallback is bounded to `character > 0` so we never
 * leak negative offsets into the spans.
 */
export function getClockTimestampPartAt(lineText: string, character: number): ClockTimestampPartHit | null {
    const match = lineText.match(CLOCK_REGEX);
    if (!match || match.index === undefined || !match.groups) return null;

    const timestampRegex = /(\d{4})-(\d{2})-(\d{2}) ([А-Яа-яA-Za-z]+) (\d{2}):(\d{2})/g;
    const timestamps = [...match[0].matchAll(timestampRegex)];
    if (timestamps.length === 0) return null;

    const spans = clockSpans(timestamps[0], match.index, 'start');
    if (match.groups.endOpenBracket && timestamps.length > 1) {
        spans.push(...clockSpans(timestamps[1], match.index, 'end'));
    }

    const direct = findPart(character, spans);
    if (direct) return { match, part: direct as ClockTimestampPart };
    if (character > 0) {
        const leftLeaning = findPart(character - 1, spans);
        if (leftLeaning) return { match, part: leftLeaning as ClockTimestampPart };
    }
    return null;
}

function clockSpans(ts: RegExpMatchArray, lineOffset: number, prefix: 'start' | 'end'): Span[] {
    const base = lineOffset + (ts.index ?? 0);
    const weekday = ts[4];
    const weekdayStart = base + 11;
    const weekdayEnd = weekdayStart + weekday.length;
    const hourStart = weekdayEnd + 1;
    const minuteStart = hourStart + 3;
    return [
        { part: `${prefix}-year` as ClockTimestampPart, start: base, end: base + 4 },
        { part: `${prefix}-month` as ClockTimestampPart, start: base + 5, end: base + 7 },
        { part: `${prefix}-day` as ClockTimestampPart, start: base + 8, end: base + 10 },
        { part: `${prefix}-weekday` as ClockTimestampPart, start: weekdayStart, end: weekdayEnd },
        { part: `${prefix}-hour` as ClockTimestampPart, start: hourStart, end: hourStart + 2 },
        { part: `${prefix}-minute` as ClockTimestampPart, start: minuteStart, end: minuteStart + 2 }
    ];
}
