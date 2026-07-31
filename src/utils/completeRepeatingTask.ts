import { HEADING_REGEX, matchTimestampLine } from '../orgPatterns';
import { TIMESTAMP_REGEX } from './timestampParts';
import { buildOrgTimestamp } from './orgTimestamp';
import { getWeekdayName } from './incrementTimestamp';
import { nextOccurrence, parseRepeater, type Repeater } from './repeater';

/**
 * What marking a repeating task done does to the lines under its heading.
 *
 * Org-mode does not close a task that repeats: the occurrence is done, the
 * next one is due later, so the planning dates move forward and the keyword
 * stays open (`org-auto-repeat-maybe`). `markdown-org-ffi` does this in
 * `complete_task`, and this module is the editor's half of the same rule —
 * see ADR-0017.
 *
 * Two divergences from upstream are inherited from the core deliberately, both
 * in the direction of leaving the file alone: a `SCHEDULED` line without a
 * repeater is kept rather than deleted, and plain timestamps in the body are
 * left where they are.
 *
 * vscode-free: it reads lines and returns replacements, so the rules are unit
 * -tested without a document.
 */

/** A planning line that moves, and what it becomes. */
export interface PlanningShift {
    /** Index into the lines the plan was built from. */
    line: number;
    text: string;
}

export interface CompletionPlan {
    /** The task repeats, so it moved forward instead of being closed. */
    repeated: boolean;
    /** Empty unless `repeated`. */
    planning: PlanningShift[];
}

export interface CompletionOptions {
    /** The whole document, as lines. */
    lines: string[];
    /** Index of the heading being completed. */
    heading: number;
    /** What "today" is, for `++` and `.+`. */
    today: Date;
    /** Whether a date is a working day, for `wd` repeaters. */
    isWorkday?: ((date: Date) => boolean) | undefined;
}

/**
 * Work out what completing the task at `heading` writes.
 *
 * Throws `RepeaterError` when a repeater is there but cannot be advanced — an
 * hourly one, or a `wd` without a calendar. Nothing is planned in that case:
 * a file half-moved is worse than one left alone, which is why every date is
 * computed before the caller writes anything.
 */
export function planCompletion(options: CompletionOptions): CompletionPlan {
    const { lines, heading, today, isWorkday } = options;
    const planning: PlanningShift[] = [];

    for (const line of planningLines(lines, heading)) {
        const moved = shift(line.text, line.repeater, today, isWorkday);
        planning.push({ line: line.index, text: moved });
    }

    return { repeated: planning.length > 0, planning };
}

interface RepeatingLine {
    index: number;
    text: string;
    repeater: Repeater;
}

/**
 * The planning lines of the heading's section that carry a repeater.
 *
 * The whole section is searched — up to the next heading, or to the end of the
 * file — rather than only the lines immediately below, because that is where
 * the extractor takes the date from: a blank line or a `CREATED:` line between
 * the heading and the planning line still leaves the date on screen.
 */
function planningLines(lines: string[], heading: number): RepeatingLine[] {
    const found: RepeatingLine[] = [];

    for (let index = heading + 1; index < lines.length; index += 1) {
        const text = lines[index] ?? '';
        if (HEADING_REGEX.test(text)) break;

        const line = matchTimestampLine(text);
        if (!line || (line.type !== 'SCHEDULED' && line.type !== 'DEADLINE')) continue;

        const parts = TIMESTAMP_REGEX.exec(line.timestamp);
        const token = parts?.groups?.repeater;
        if (!token) continue;

        const repeater = parseRepeater(token);
        if (!repeater) continue;

        found.push({ index, text, repeater });
    }

    return found;
}

/** The same planning line with its date moved to the next occurrence. */
function shift(
    text: string,
    repeater: Repeater,
    today: Date,
    isWorkday: ((date: Date) => boolean) | undefined
): string {
    const line = matchTimestampLine(text);
    const parts = line ? TIMESTAMP_REGEX.exec(line.timestamp) : null;
    if (!line || !parts?.groups) {
        // planningLines only yields lines both of these matched.
        throw new Error(`planning line stopped matching: ${text}`);
    }

    const g = parts.groups;
    const hour = g.hour ? parseInt(g.hour, 10) : undefined;
    const minute = g.minute ? parseInt(g.minute, 10) : undefined;
    const base = new Date(
        parseInt(g.year ?? '', 10),
        parseInt(g.month ?? '', 10) - 1,
        parseInt(g.day ?? '', 10),
        hour ?? 0,
        minute ?? 0
    );

    const moved = nextOccurrence({ base, today, repeater, isWorkday });
    // The time of day rides along: the repeater moves the date, and a task at
    // 09:30 stays at 09:30.
    moved.setHours(hour ?? 0, minute ?? 0, 0, 0);

    const timestamp = buildOrgTimestamp({
        date: moved,
        bracket: line.active ? 'angle' : 'square',
        weekday: g.weekday ? getWeekdayName(moved, g.weekday) : undefined,
        includeTime: hour !== undefined && minute !== undefined,
        repeater: g.repeater ?? undefined,
        warning: g.warning ?? undefined
    });

    return `${line.indent}\`${line.type}: ${timestamp}\``;
}
