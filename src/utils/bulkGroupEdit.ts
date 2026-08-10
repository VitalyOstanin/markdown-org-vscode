/**
 * Acting on a whole band of overdue tasks in one move.
 *
 * A backlog is answered band by band rather than task by task, and doing that
 * as N single edits would rewrite one file N times. Here a file is read once,
 * every task of the group that lives in it is rewritten, and the file is
 * written once.
 *
 * Two properties the single-task commands do not need:
 *
 *   * a task that cannot be edited -- its heading has moved since the agenda
 *     was built, it carries no planning line, its repeater is one this
 *     extension does not advance -- is refused on its own and named, while the
 *     rest of the group goes through. Failing the whole band over one entry
 *     would leave the user to find which one it was;
 *   * the plan is computed in full before anything is written, so a file is
 *     never left half-moved.
 *
 * The same three actions and the same rules as the Android client's
 * `apply_to_group` (`rust/markdown-org-ffi/src/bulk.rs`), reimplemented here:
 * the editing half of the ecosystem lives in that crate, and the extension
 * talks to the extractor as a read-only process.
 *
 * vscode-free: lines in, lines out, so the rules are unit-tested without a
 * document.
 */
import { HEADING_REGEX, matchTimestampLine } from '../orgPatterns';
import { TIMESTAMP_REGEX } from './timestampParts';
import { buildOrgTimestamp } from './orgTimestamp';
import { getWeekdayName } from './incrementTimestamp';
import { nextOccurrence, parseRepeater } from './repeater';
import { buildHeading } from './buildHeading';
import { normalizeTaskType } from './normalizeTaskType';
import { formatError } from './formatError';

/** What to do to every task of the group. */
export type BulkAction =
    /**
     * Give the planning date today's date. A repeating task catches up to its
     * next occurrence instead, keeping its repeater -- the same rule marking a
     * repeating task DONE follows, because a missed repeat is not rescheduled
     * but caught up.
     */
    | 'move-to-today'
    /** Take the planning line out, leaving the task without a date. */
    | 'drop-planning'
    /** Set the keyword to `CANCELLED`, leaving the dates where they are. */
    | 'cancel';

/** Why one task of the group was left alone. */
export type RefusalReason =
    /** The line no longer holds the heading the agenda was built from. */
    | 'moved'
    /** The task carries no planning line of the kind the action needs. */
    | 'no-planning-line'
    /** An edit this extension does not make -- an hourly repeater, say. */
    | 'unsupported';

/** One task of the group, as the agenda row named it. */
export interface BulkTarget {
    /** Path the extractor reported; only compared, never opened, in here. */
    file: string;
    /** 1-based line the heading was found on. */
    line: number;
    /** Heading text with the keyword and the priority cookie stripped. */
    heading: string;
    /** The planning line the row was placed by, when the row carries one. */
    keyword?: 'SCHEDULED' | 'DEADLINE' | undefined;
}

export interface BulkRefusal {
    file: string;
    line: number;
    heading: string;
    reason: RefusalReason;
    /** English detail, for the log. */
    detail: string;
}

export interface BulkFilePlan {
    /** The file's lines after the action; identical to the input when nothing applied. */
    lines: string[];
    /** How many of the targets were rewritten. */
    applied: number;
    refusals: BulkRefusal[];
}

export interface BulkEditOptions {
    /** The whole file, as lines. */
    lines: readonly string[];
    /** The targets of this file, in any order. */
    targets: readonly BulkTarget[];
    action: BulkAction;
    /** What "today" is. */
    today: Date;
    /** Whether a date is a working day, for `wd` repeaters. */
    isWorkday?: ((date: Date) => boolean) | undefined;
}

/** One line the plan rewrites, or removes when `text` is null. */
interface LineChange {
    index: number;
    text: string | null;
}

/**
 * Work out what one file looks like after the action.
 *
 * Every target is planned against the file as it was read: the changes are
 * line replacements and deletions, applied together at the end, so a deletion
 * cannot shift the line another target was aimed at.
 */
export function planGroupEdit(options: BulkEditOptions): BulkFilePlan {
    const { lines, targets, action, today, isWorkday } = options;
    const changes: LineChange[] = [];
    const refusals: BulkRefusal[] = [];
    let applied = 0;

    for (const target of targets) {
        const index = target.line - 1;
        const headingText = lines[index] ?? '';
        const heading = HEADING_REGEX.exec(headingText);
        // The extractor strips the trailing tags off a heading, so the stored
        // text is a prefix of the line rather than the whole of it. Anything
        // else means the file has been rewritten since the agenda was built --
        // by a sync, or by hand in another window.
        if (!heading?.groups || !(heading.groups.title ?? '').startsWith(target.heading)) {
            refusals.push(refusal(target, 'moved', `line ${target.line} no longer holds this heading`));
            continue;
        }

        const planned =
            action === 'cancel'
                ? planCancel(headingText, heading, index)
                : planPlanningLines(lines, index, target, action, today, isWorkday);

        if (typeof planned === 'string') {
            const reason: RefusalReason = planned === NO_PLANNING_LINE ? 'no-planning-line' : 'unsupported';
            refusals.push(refusal(target, reason, detailOf(planned)));
            continue;
        }
        if (planned.length > 0) {
            changes.push(...planned);
            applied += 1;
        }
    }

    return { lines: applyChanges(lines, changes), applied, refusals };
}

/**
 * The changes the action makes, or why it makes none.
 *
 * A string is the refusal: `NO_PLANNING_LINE` for the one case the planner
 * names itself, and anything else is the message an edit failed with.
 */
type Planned = LineChange[] | string;

const NO_PLANNING_LINE = 'no-planning-line';

function planCancel(headingText: string, heading: RegExpExecArray, index: number): Planned {
    const groups = heading.groups ?? {};
    if (normalizeTaskType(groups.status) === 'CANCELLED' || normalizeTaskType(groups.status) === 'CANCELED') {
        // Already where the action would put it: nothing to write, and nothing
        // that went wrong either.
        return [];
    }
    const rewritten = buildHeading({
        hashes: groups.hashes ?? '#',
        status: 'CANCELLED',
        priority: groups.priority,
        title: groups.title ?? ''
    });
    return rewritten === headingText ? [] : [{ index, text: rewritten }];
}

/**
 * The planning lines of the task's section, moved to today or removed.
 *
 * The whole section is searched -- up to the next heading -- rather than only
 * the lines right below the heading, because that is where the extractor takes
 * the date from: a blank line or a `CREATED:` line in between still leaves the
 * date on screen. When the row named the keyword it was placed by, only that
 * kind is touched; a row that named none (an undated task reached through the
 * Tasks card) has both kinds acted on.
 */
function planPlanningLines(
    lines: readonly string[],
    heading: number,
    target: BulkTarget,
    action: Exclude<BulkAction, 'cancel'>,
    today: Date,
    isWorkday: ((date: Date) => boolean) | undefined
): Planned {
    const changes: LineChange[] = [];

    for (let index = heading + 1; index < lines.length; index += 1) {
        const text = lines[index] ?? '';
        if (HEADING_REGEX.test(text)) break;

        const line = matchTimestampLine(text);
        if (!line || (line.type !== 'SCHEDULED' && line.type !== 'DEADLINE')) continue;
        if (target.keyword && line.type !== target.keyword) continue;

        if (action === 'drop-planning') {
            changes.push({ index, text: null });
            continue;
        }
        try {
            changes.push({ index, text: movedToToday(text, today, isWorkday) });
        } catch (error) {
            // Nothing of this target is written: a task whose SCHEDULED moved
            // but whose DEADLINE could not would be worse than one left alone.
            return formatError(error);
        }
    }

    return changes.length > 0 ? changes : NO_PLANNING_LINE;
}

/**
 * The same planning line with its date on today -- or, for a repeating task,
 * on the next occurrence its repeater reaches.
 */
function movedToToday(text: string, today: Date, isWorkday: ((date: Date) => boolean) | undefined): string {
    const line = matchTimestampLine(text);
    const parts = line ? TIMESTAMP_REGEX.exec(line.timestamp) : null;
    if (!line || !parts?.groups) {
        // The caller only passes lines both of these matched.
        throw new Error(`planning line stopped matching: ${text}`);
    }

    const g = parts.groups;
    const hour = g.hour ? parseInt(g.hour, 10) : undefined;
    const minute = g.minute ? parseInt(g.minute, 10) : undefined;
    const repeater = g.repeater ? parseRepeater(g.repeater) : null;

    let moved: Date;
    if (repeater) {
        const base = new Date(
            parseInt(g.year ?? '', 10),
            parseInt(g.month ?? '', 10) - 1,
            parseInt(g.day ?? '', 10),
            hour ?? 0,
            minute ?? 0
        );
        moved = nextOccurrence({ base, today, repeater, isWorkday });
    } else {
        moved = new Date(today.getTime());
    }
    // The time of day rides along: the date moves, and a task at 09:30 stays
    // at 09:30.
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

/** Replacements and deletions applied to the file in one pass. */
function applyChanges(lines: readonly string[], changes: readonly LineChange[]): string[] {
    if (changes.length === 0) {
        return [...lines];
    }
    const replaced = new Map<number, string | null>();
    for (const change of changes) {
        replaced.set(change.index, change.text);
    }
    const out: string[] = [];
    lines.forEach((text, index) => {
        if (!replaced.has(index)) {
            out.push(text);
            return;
        }
        const value = replaced.get(index);
        if (value !== null && value !== undefined) {
            out.push(value);
        }
    });
    return out;
}

function refusal(target: BulkTarget, reason: RefusalReason, detail: string): BulkRefusal {
    return { file: target.file, line: target.line, heading: target.heading, reason, detail };
}

function detailOf(planned: string): string {
    return planned === NO_PLANNING_LINE ? 'the task carries no SCHEDULED or DEADLINE line' : planned;
}
