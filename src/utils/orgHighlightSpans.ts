import { HEADING_REGEX } from '../orgPatterns';
import { TIMESTAMP_REGEX, isPairedBracket } from './timestampParts';

/**
 * What a highlighted stretch of a line means. The editor decorations map each
 * kind onto a theme colour token; the names say what the text is, not which
 * colour it gets, so a palette change is one table away from here.
 */
export type HighlightKind =
    | 'planning-deadline'
    | 'planning-scheduled'
    | 'planning-closed'
    | 'planning-created'
    | 'planning-clock'
    | 'date'
    | 'weekday'
    | 'time'
    | 'repeater'
    | 'warning'
    | 'status-todo'
    | 'status-done'
    | 'status-cancelled'
    | 'priority-a'
    | 'priority-b'
    | 'priority-c';

/** A half-open `[start, end)` range of character columns within one line. */
export interface HighlightSpan {
    kind: HighlightKind;
    start: number;
    end: number;
}

/**
 * Planning keywords are matched anywhere on the line, at any indentation, and
 * with or without the backticks the extension writes. That is deliberate: the
 * markdown grammar turns a line indented by four spaces into an indented code
 * block and stops highlighting anything inside it, which is the whole reason
 * these decorations exist. `markdown-org-extract` reads such a line as well
 * (`^\s*((?:SCHEDULED|DEADLINE):\s*)<...>` in its `timestamp/extract.rs`), so
 * colouring it keeps the editor and the agenda telling the same story.
 */
const PLANNING_KEYWORD_REGEX = /(SCHEDULED|DEADLINE|CLOSED|CREATED|CLOCK)(?=:)/g;

const PLANNING_KINDS: Record<string, HighlightKind> = {
    SCHEDULED: 'planning-scheduled',
    DEADLINE: 'planning-deadline',
    CLOSED: 'planning-closed',
    CREATED: 'planning-created',
    CLOCK: 'planning-clock'
};

const STATUS_KINDS: Record<string, HighlightKind> = {
    TODO: 'status-todo',
    DONE: 'status-done',
    CANCELLED: 'status-cancelled',
    CANCELED: 'status-cancelled'
};

const PRIORITY_KINDS: Record<string, HighlightKind> = {
    A: 'priority-a',
    B: 'priority-b',
    C: 'priority-c'
};

// `d` (hasIndices) is what makes these patterns usable for painting rather than
// parsing: the group positions come from the engine, so the spans cannot drift
// away from the pattern the way hand-counted offsets do.
const TIMESTAMP_SCAN_REGEX = new RegExp(TIMESTAMP_REGEX, 'gd');
const HEADING_SPAN_REGEX = new RegExp(HEADING_REGEX, 'd');

function groupSpan(match: RegExpExecArray, name: string): [number, number] | undefined {
    return match.indices?.groups?.[name];
}

function pushGroup(spans: HighlightSpan[], match: RegExpExecArray, name: string, kind: HighlightKind): void {
    const span = groupSpan(match, name);
    if (!span) {
        return;
    }
    spans.push({ kind: kind, start: span[0], end: span[1] });
}

/**
 * The date part is painted as one stretch `YYYY-MM-DD` rather than three, so
 * the separators do not fall back to the surrounding colour and break the date
 * into pieces.
 */
function pushDate(spans: HighlightSpan[], match: RegExpExecArray): void {
    const year = groupSpan(match, 'year');
    const day = groupSpan(match, 'day');
    if (!year || !day) {
        return;
    }
    spans.push({ kind: 'date', start: year[0], end: day[1] });
}

/** Likewise `HH:MM` is one stretch, colon included. */
function pushTime(spans: HighlightSpan[], match: RegExpExecArray): void {
    const hour = groupSpan(match, 'hour');
    const minute = groupSpan(match, 'minute');
    if (!hour || !minute) {
        return;
    }
    spans.push({ kind: 'time', start: hour[0], end: minute[1] });
}

function collectTimestampSpans(lineText: string, spans: HighlightSpan[]): void {
    TIMESTAMP_SCAN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TIMESTAMP_SCAN_REGEX.exec(lineText)) !== null) {
        const { open, close } = match.groups ?? {};
        if (open === undefined || close === undefined || !isPairedBracket(open, close)) {
            continue;
        }
        pushDate(spans, match);
        pushGroup(spans, match, 'weekday', 'weekday');
        pushTime(spans, match);
        pushGroup(spans, match, 'repeater', 'repeater');
        pushGroup(spans, match, 'warning', 'warning');
    }
}

function collectHeadingSpans(lineText: string, spans: HighlightSpan[]): void {
    const match = HEADING_SPAN_REGEX.exec(lineText);
    if (!match) {
        return;
    }
    const status = match.groups?.status;
    const statusSpan = groupSpan(match, 'status');
    if (status && statusSpan) {
        const kind = STATUS_KINDS[status];
        if (kind) {
            spans.push({ kind: kind, start: statusSpan[0], end: statusSpan[1] });
        }
    }

    const priority = match.groups?.priority;
    const prioritySpan = groupSpan(match, 'priority');
    if (priority && prioritySpan) {
        const kind = PRIORITY_KINDS[priority];
        if (kind) {
            // The captured group is the letter alone; the cookie the agenda
            // shows as a chip is `[#A]`, so the span grows over the brackets
            // the pattern already vouched for.
            spans.push({ kind: kind, start: prioritySpan[0] - 2, end: prioritySpan[1] + 1 });
        }
    }
}

function collectPlanningSpans(lineText: string, spans: HighlightSpan[]): void {
    PLANNING_KEYWORD_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PLANNING_KEYWORD_REGEX.exec(lineText)) !== null) {
        const keyword = match[0];
        const kind = PLANNING_KINDS[keyword];
        if (kind) {
            spans.push({ kind: kind, start: match.index, end: match.index + keyword.length });
        }
    }
}

/**
 * The stretches of one line worth colouring, in no particular order: planning
 * keywords, the parts of every timestamp on the line, and -- on a heading --
 * the status keyword and the priority cookie. Only priorities A, B and C get a
 * span, matching the agenda, which chips those three and leaves the rest plain.
 *
 * What is left between the spans -- backticks, the colon after the keyword, the
 * timestamp brackets, a CLOCK range's `--` and its duration -- is not painted
 * here. It gets its colour from the injection grammar in
 * `syntaxes/markdown-org-planning-line.tmLanguage.json`, which marks the whole
 * planning line as inline code so the punctuation keeps the colour it has
 * always had at shallow indentation.
 */
export function computeHighlightSpans(lineText: string): HighlightSpan[] {
    const spans: HighlightSpan[] = [];
    collectPlanningSpans(lineText, spans);
    collectTimestampSpans(lineText, spans);
    collectHeadingSpans(lineText, spans);
    return spans;
}
