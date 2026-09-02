import { HEADING_REGEX, matchTimestampLine } from '../orgPatterns';
import type { TaskStatus } from '../types';
import { TIMESTAMP_REGEX } from './timestampParts';
import { buildHeading } from './buildHeading';
import { buildOrgTimestamp } from './orgTimestamp';
import { getWeekdayName } from './incrementTimestamp';
import type { PhraseFields } from './phraseEntry';

/**
 * Changing an entry that exists by saying what to change.
 *
 * The same rules that read a phrase into a new entry read one into an edit:
 * the extractor answers with the fields a phrase named, a keyword among them,
 * and with the fields it said to empty. What is here is the other half — those
 * fields applied to the heading the cursor stands in and to the planning line
 * under it.
 *
 * vscode-free: lines in, lines out, so the rules are unit-tested without a
 * document, the way `bulkGroupEdit` and `phraseEntry` are.
 */

/** Why a phrase changed nothing. */
export type PhraseEditRefusal =
    /** The line the cursor stands in is not a heading this extension writes. */
    | 'not-a-heading'
    /** The phrase named no field at all — every word of it was leftover. */
    | 'nothing-said'
    /**
     * The phrase named an hour or a repeater, and neither it nor the entry has
     * a day to hang one on: an org timestamp has no way to say an hour without
     * a date.
     */
    | 'no-date-to-put-it-on';

/** What the edit touched, for the line that says what happened. */
export type PhraseEditField = 'keyword' | 'priority' | 'date' | 'time' | 'repeater';

export interface PhraseEditOptions {
    /** The whole file, as lines. */
    lines: readonly string[];
    /** 0-based index of the heading being edited. */
    heading: number;
    /** What the phrase said, as the extractor answered. */
    fields: PhraseFields;
    /** Localized short weekday names, Sunday first, as `Date.getDay()` indexes them. */
    weekdays: readonly string[];
}

export interface PhraseEditPlan {
    /** The file after the edit; identical to the input when nothing applied. */
    lines: string[];
    /** The fields the edit touched, in the order they are announced. */
    changed: PhraseEditField[];
    /** Set when nothing was written, and why. */
    refusal?: PhraseEditRefusal;
}

/** The planning line of the entry, and where it stands. */
interface PlanningLine {
    index: number;
    keyword: 'SCHEDULED' | 'DEADLINE';
    indent: string;
    timestamp: string;
}

/** The pieces of a timestamp the edit rewrites one at a time. */
interface TimestampParts {
    date: Date;
    hasTime: boolean;
    repeater?: string | undefined;
    warning?: string | undefined;
    /** The weekday token as the file spells it, when it carries one. */
    weekday?: string | undefined;
}

/** One line replaced, or removed when `text` is null, and one line inserted. */
interface Writes {
    replace: Map<number, string | null>;
    /** The line to write under `after`, when the entry gains a planning line. */
    insert?: { after: number; text: string } | undefined;
}

function refuse(lines: readonly string[], refusal: PhraseEditRefusal): PhraseEditPlan {
    return { lines: [...lines], changed: [], refusal };
}

/** Whether the phrase said anything at all about the entry. */
function saysSomething(fields: PhraseFields): boolean {
    return (
        fields.keyword !== undefined ||
        fields.priority !== undefined ||
        fields.date !== undefined ||
        fields.time !== undefined ||
        fields.repeater !== undefined ||
        fields.cleared.length > 0
    );
}

/**
 * Work out what the entry looks like after the phrase.
 *
 * Every field is applied to the file as it was read, and the file is rebuilt
 * once at the end, so a planning line removed cannot shift the heading another
 * field was written to.
 */
export function planPhraseEdit(options: PhraseEditOptions): PhraseEditPlan {
    const { lines, heading, fields, weekdays } = options;
    const headingText = lines[heading] ?? '';
    const match = HEADING_REGEX.exec(headingText);
    if (!match?.groups) {
        return refuse(lines, 'not-a-heading');
    }
    if (!saysSomething(fields)) {
        return refuse(lines, 'nothing-said');
    }

    const cleared = new Set(fields.cleared);
    const changed: PhraseEditField[] = [];
    const writes: Writes = { replace: new Map() };

    const rewritten = editedHeading(headingText, match, fields, cleared, changed);
    if (rewritten !== headingText) {
        writes.replace.set(heading, rewritten);
    }

    if (touchesTheDate(fields, cleared)) {
        const outcome = editedPlanning(lines, heading, fields, cleared, weekdays, changed);
        if (typeof outcome === 'string') {
            return refuse(lines, outcome);
        }
        for (const [index, text] of outcome.replace) {
            writes.replace.set(index, text);
        }
        writes.insert = outcome.insert;
    }

    if (changed.length === 0) {
        // Every field the phrase named already said what the entry says: the
        // file is left alone rather than rewritten byte for byte.
        return { lines: [...lines], changed };
    }
    return { lines: rebuild(lines, writes), changed };
}

/** Whether anything the phrase said belongs on the planning line. */
function touchesTheDate(fields: PhraseFields, cleared: ReadonlySet<string>): boolean {
    return (
        fields.date !== undefined ||
        fields.time !== undefined ||
        fields.repeater !== undefined ||
        fields.planning !== undefined ||
        cleared.has('date') ||
        cleared.has('time') ||
        cleared.has('repeater')
    );
}

/**
 * The heading with the keyword and the priority the phrase named.
 *
 * A field the phrase did not mention keeps what the heading carries, and a
 * cleared one is dropped — which is the same rule the whole edit follows.
 */
function editedHeading(
    text: string,
    match: RegExpExecArray,
    fields: PhraseFields,
    cleared: ReadonlySet<string>,
    changed: PhraseEditField[]
): string {
    const groups = match.groups ?? {};
    const current = groups.status as TaskStatus | undefined;
    const status = fields.keyword ?? current;
    const priority = cleared.has('priority') ? undefined : (fields.priority ?? groups.priority);

    const rewritten = buildHeading({
        hashes: groups.hashes ?? '#',
        status,
        priority,
        title: groups.title ?? ''
    });
    if (rewritten === text) {
        return text;
    }
    // Named one at a time so the line that announces the edit says which of
    // the two moved: a phrase can name both at once.
    if (status !== current) {
        changed.push('keyword');
    }
    if (priority !== groups.priority) {
        changed.push('priority');
    }
    return rewritten;
}

/**
 * The `SCHEDULED:` or `DEADLINE:` line of the entry's own section.
 *
 * The whole section is searched — up to the next heading — because that is
 * where the extractor takes the date from: a blank line or a `CREATED:` line
 * in between still leaves the date on screen. The first of the two kinds found
 * is the one an edit rewrites; an entry carrying both is answered by the kind
 * the phrase names ("к пятнице" against "в пятницу").
 */
function findPlanningLine(lines: readonly string[], heading: number): PlanningLine | undefined {
    for (let index = heading + 1; index < lines.length; index += 1) {
        const text = lines[index] ?? '';
        if (HEADING_REGEX.test(text)) {
            return undefined;
        }
        const line = matchTimestampLine(text);
        if (line && (line.type === 'SCHEDULED' || line.type === 'DEADLINE')) {
            return { index, keyword: line.type, indent: line.indent, timestamp: line.timestamp };
        }
    }
    return undefined;
}

/** What the planning line of the entry says now, as pieces to rewrite. */
function partsOf(planning: PlanningLine | undefined): TimestampParts | undefined {
    if (!planning) {
        return undefined;
    }
    const parts = TIMESTAMP_REGEX.exec(planning.timestamp);
    if (!parts?.groups) {
        return undefined;
    }
    const g = parts.groups;
    const date = new Date(
        parseInt(g.year ?? '', 10),
        parseInt(g.month ?? '', 10) - 1,
        parseInt(g.day ?? '', 10),
        g.hour ? parseInt(g.hour, 10) : 0,
        g.minute ? parseInt(g.minute, 10) : 0
    );
    return {
        date,
        hasTime: g.hour !== undefined && g.minute !== undefined,
        repeater: g.repeater,
        warning: g.warning,
        weekday: g.weekday
    };
}

/**
 * The lines the planning half of the edit writes, or why it writes none.
 *
 * Removing the date removes the line: a `SCHEDULED:` with no day is not a
 * line. Everything else rewrites the line the entry has, or writes one under
 * the heading when it has none.
 */
function editedPlanning(
    lines: readonly string[],
    heading: number,
    fields: PhraseFields,
    cleared: ReadonlySet<string>,
    weekdays: readonly string[],
    changed: PhraseEditField[]
): Writes | PhraseEditRefusal {
    const planning = findPlanningLine(lines, heading);
    const writes: Writes = { replace: new Map() };

    if (cleared.has('date')) {
        if (planning) {
            writes.replace.set(planning.index, null);
            changed.push('date');
        }
        return writes;
    }

    const current = partsOf(planning);
    const date = dateOf(fields, current);
    if (!date) {
        // An hour or a repeater with nowhere to stand. Refused rather than
        // written onto today, which is a day the phrase did not name.
        return 'no-date-to-put-it-on';
    }

    const hour = hourOf(fields, current, cleared);
    date.setHours(hour?.hours ?? 0, hour?.minutes ?? 0, 0, 0);
    const repeater = cleared.has('repeater') ? undefined : (fields.repeater ?? current?.repeater);
    const keyword = keywordOf(fields, planning);
    const indent = planning?.indent ?? indentUnder(lines, heading);
    const text = `${indent}\`${keyword}: ${buildOrgTimestamp({
        date,
        bracket: 'angle',
        // The file's own spelling is kept where there is one: a note written
        // in English keeps its English weekdays whatever language the editor
        // is set to, which is how moving a date already behaves.
        weekday: current?.weekday ? getWeekdayName(date, current.weekday) : weekdays[date.getDay()],
        includeTime: hour !== undefined,
        repeater,
        warning: current?.warning
    })}\``;

    if (planning && lines[planning.index] === text) {
        return writes;
    }
    // What moved is worked out from the fields rather than from the text: the
    // line is written whole, so a rewritten one differs in every token that
    // was reformatted, not only in the ones the phrase named.
    if (fields.date !== undefined || fields.planning !== undefined || !planning) {
        changed.push('date');
    }
    if (fields.time !== undefined || cleared.has('time')) {
        changed.push('time');
    }
    if (fields.repeater !== undefined || cleared.has('repeater')) {
        changed.push('repeater');
    }
    if (planning) {
        writes.replace.set(planning.index, text);
    } else {
        writes.insert = { after: insertionPoint(lines, heading), text };
    }
    return writes;
}

/** The day the timestamp lands on: the one the phrase named, or the one it had. */
function dateOf(fields: PhraseFields, current: TimestampParts | undefined): Date | undefined {
    if (fields.date !== undefined) {
        const [year, month, day] = fields.date.split('-').map(Number);
        // Built field by field rather than parsed: `new Date('...')` reads a
        // bare date as UTC, which lands on the previous day west of Greenwich.
        return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
    }
    return current ? new Date(current.date.getTime()) : undefined;
}

/** The hour the timestamp carries, when it carries one. */
function hourOf(
    fields: PhraseFields,
    current: TimestampParts | undefined,
    cleared: ReadonlySet<string>
): { hours: number; minutes: number } | undefined {
    if (cleared.has('time')) {
        return undefined;
    }
    if (fields.time !== undefined) {
        const [hours, minutes] = fields.time.split(':').map(Number);
        return { hours: hours ?? 0, minutes: minutes ?? 0 };
    }
    if (current?.hasTime) {
        return { hours: current.date.getHours(), minutes: current.date.getMinutes() };
    }
    return undefined;
}

/**
 * Which planning line the date belongs on: the one the phrase said outright,
 * the one the entry already uses, or `SCHEDULED` for an entry that had none.
 */
function keywordOf(fields: PhraseFields, planning: PlanningLine | undefined): 'SCHEDULED' | 'DEADLINE' {
    if (fields.planning !== undefined) {
        return fields.planning === 'deadline' ? 'DEADLINE' : 'SCHEDULED';
    }
    return planning?.keyword ?? 'SCHEDULED';
}

/** The indent a new planning line takes, read off the line under the heading. */
function indentUnder(lines: readonly string[], heading: number): string {
    const below = matchTimestampLine(lines[heading + 1] ?? '');
    return below ? below.indent : '';
}

/**
 * Where a planning line the entry did not have is written: under the heading,
 * and under the `CREATED:` mark when there is one, which is the order both
 * clients write an entry in.
 */
function insertionPoint(lines: readonly string[], heading: number): number {
    let at = heading;
    for (let index = heading + 1; index < lines.length; index += 1) {
        const line = matchTimestampLine(lines[index] ?? '');
        if (!line || (line.type !== 'CREATED' && line.type !== 'CLOSED')) {
            break;
        }
        at = index;
    }
    return at;
}

/** The file with the planned replacements, the deletions and the insertion. */
function rebuild(lines: readonly string[], writes: Writes): string[] {
    const out: string[] = [];
    lines.forEach((text, index) => {
        const planned = writes.replace.has(index) ? writes.replace.get(index) : text;
        if (planned !== null && planned !== undefined) {
            out.push(planned);
        }
        if (writes.insert?.after === index) {
            out.push(writes.insert.text);
        }
    });
    return out;
}
