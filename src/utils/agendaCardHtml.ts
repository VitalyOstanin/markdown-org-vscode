/**
 * HTML for a task row and for the card that stacks rows into section panels.
 *
 * The Day and Tasks views share this vocabulary: a sticky summary bar over a
 * stack of section panels, each holding `.task-line` rows. Only the grouping
 * differs (schedule bucket vs priority cookie), so the markup lives here once.
 *
 * Same reason as the sibling `agenda*Html.ts` modules: these read the UI
 * dictionary and the view's live state off the client's closure, which put them
 * out of reach of the unit suite -- the page runs in a webview no coverage
 * runner instruments. They take that state as parameters instead.
 *
 * Inlined into the page through `Function.prototype.toString()`: a body may
 * only touch its own parameters and functions defined in this module. No value
 * imports -- a cross-module call compiles to `module_1.fn`, undefined in the
 * page.
 */
import type { Task, TaskWithOffset } from '../types';
import type { AgendaStrings } from './agendaI18n';
import type { HeadingTintInput } from './agendaHeadingTint';
import type { EscapeHtml, FormatString } from './agendaSummaryHtml';

type TooltipStrings = AgendaStrings['tooltips'];

/** What a row needs to know beyond the task itself. */
export interface TaskRowContext {
    tooltips: TooltipStrings;
    escapeHtml: EscapeHtml;
    formatString: FormatString;
    /** Renders a task's own date for the offset column and the flag tooltips. */
    formatDate: (iso: string) => string;
    sanitizeTaskLine: (value: unknown) => number;
    isCancelled: (status: string | undefined) => boolean;
    resolveTaskFlag: (task: Task, isCancelled: (status: string | undefined) => boolean) => string;
    resolveAttentionLevel: (
        task: Task,
        daysOffset: number | undefined,
        taskType: string | undefined,
        isCancelled: (status: string | undefined) => boolean
    ) => string;
    resolveHeadingClass: (task: HeadingTintInput) => string;
    attentionTooltip: (level: string, strings: TooltipStrings) => string;
    flagTooltip: (
        flag: string,
        strings: TooltipStrings,
        fill: FormatString,
        fmtDate: (iso: string) => string,
        task?: TaskWithOffset
    ) => string;
    priorityTooltip: (letter: string, strings: TooltipStrings, fill: FormatString) => string;
}

/**
 * One task row. `daysOffset` and `taskType` come from the bucket the row sits
 * in: they decide whether the offset column shows a date and which direction
 * (overdue or upcoming) it reads as.
 */
export function renderTaskRow(
    task: TaskWithOffset,
    daysOffset: number | undefined,
    taskType: string | undefined,
    ctx: TaskRowContext
): string {
    const status = task.task_type ?? '';
    const priorityLetter = task.priority ?? '';
    const statusKind =
        status === 'TODO' ? 'todo' : status === 'DONE' ? 'done' : ctx.isCancelled(status) ? 'cancelled' : '';
    // Escaped once and used in both the row and the chip: this is the hottest
    // string in the renderer (a month view emits it per task).
    const priorityAttr = ctx.escapeHtml(priorityLetter.toLowerCase());
    const flag = ctx.resolveTaskFlag(task, ctx.isCancelled);
    const attention = ctx.resolveAttentionLevel(task, daysOffset, taskType, ctx.isCancelled);

    const dateDisplay =
        daysOffset !== undefined && daysOffset !== 0 && task.timestamp_date ? ctx.formatDate(task.timestamp_date) : '';
    const dateDir = taskType === 'upcoming' ? 'upcoming' : 'overdue';
    // Source of truth: agendaHeadingTint.ts. `typeAttr` feeds the
    // [data-type="deadline"] selector that paints the heading red for a
    // DEADLINE task; resolveHeadingClass still owns the DEADLINE > priority >
    // default precedence rule.
    const typeAttr = ctx.resolveHeadingClass(task).includes('deadline') ? 'deadline' : 'scheduled';

    return (
        `<div class="task-line" data-status="${statusKind}" data-priority="${priorityAttr}"` +
        ` data-type="${typeAttr}" data-file="${ctx.escapeHtml(task.file)}"` +
        ` data-line="${ctx.sanitizeTaskLine(task.line)}">` +
        // The big-time column: a clean HH:MM, or empty for an all-day task (the
        // stylesheet then fills in an em-dash placeholder).
        `<span class="time-plain">${ctx.escapeHtml(task.timestamp_time ?? '')}</span>` +
        `<span class="status" data-status="${statusKind}" data-attention="${attention}"` +
        ` title="${ctx.escapeHtml(ctx.attentionTooltip(attention, ctx.tooltips))}">${ctx.escapeHtml(status)}</span>` +
        // .flag: the type glyph (deadline/scheduled/repeat/cancelled).
        `<span class="flag" data-flag="${flag}"` +
        ` title="${ctx.escapeHtml(ctx.flagTooltip(flag, ctx.tooltips, ctx.formatString, ctx.formatDate, task))}"></span>` +
        `<span class="priority" data-priority="${priorityAttr}"` +
        ` title="${ctx.escapeHtml(ctx.priorityTooltip(priorityLetter, ctx.tooltips, ctx.formatString))}">` +
        `${ctx.escapeHtml(priorityLetter)}</span>` +
        `<span class="heading">${ctx.escapeHtml(task.heading)}</span>` +
        `<span class="offset" data-dir="${dateDir}">${dateDisplay}</span>` +
        '</div>'
    );
}

/**
 * The card both views render into: the summary bar, then either the section
 * panels or the empty-state line. `kind` lands in `data-card`, which is how the
 * integration suite tells the two views apart.
 */
export function renderCard(
    kind: 'day' | 'tasks',
    summaryHtml: string,
    sectionsHtml: string,
    emptyText: string,
    ctx: { escapeHtml: EscapeHtml }
): string {
    const body = sectionsHtml || `<div class="day-empty">${ctx.escapeHtml(emptyText)}</div>`;
    return `<div class="day-card" data-card="${kind}">${summaryHtml}${body}</div>`;
}
