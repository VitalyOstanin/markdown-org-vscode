import { Task } from '../types';

/**
 * Tasks-view card model: the summary counts and the ordered priority groups
 * the date-less Tasks agenda renders as stacked panels.
 *
 * The Tasks view lists every open task with no date axis, so its only useful
 * grouping is the org priority cookie (`[#A]` / `[#B]` / `[#C]`, or none).
 * Groups are emitted highest-priority first with the unprioritised backlog
 * last, mirroring how the Day card puts its actionable work above the backlog.
 *
 * Both helpers are pure and unit-tested here, then embedded into the webview
 * via `.toString()`, so these tests transitively cover the runtime behaviour.
 * Keep them self-contained: they may only touch their parameters, never
 * module-scope imports (the `Task` import is a type, erased at compile time
 * and absent from the `.toString()` body).
 */

/** Headline counts shown in the Tasks card's summary line. */
export interface TasksSummary {
    /** Total tasks in the payload. */
    total: number;
    /** Tasks carrying the `[#A]` priority cookie. */
    highPriority: number;
    /** Tasks whose `task_type` is `DONE`. */
    done: number;
}

/** Stable markup hook for a group: the priority letter, or `none`. */
export type TaskGroupKey = 'a' | 'b' | 'c' | 'none';

export interface TaskGroup {
    key: TaskGroupKey;
    /** Human-readable panel title, in the active UI language. */
    title: string;
    items: Task[];
}

/** Group titles, supplied by the caller (see `AgendaStrings.groups`). */
export interface TaskGroupLabels {
    a: string;
    b: string;
    c: string;
    none: string;
}

export function computeTasksSummary(tasks: Task[]): TasksSummary {
    const all = Array.isArray(tasks) ? tasks : [];
    return {
        total: all.length,
        highPriority: all.filter((t) => (t.priority || '').trim().toUpperCase() === 'A').length,
        done: all.filter((t) => t.task_type === 'DONE').length
    };
}

/**
 * Ordered, non-empty priority groups for the card: A, B, C, then everything
 * without a (recognised) priority. Empty groups are dropped so the card never
 * shows a "(0)" panel. The letter is upper-cased before matching, so a
 * lowercase cookie lands in its own group rather than in the backlog.
 *
 * The titles come in as `labels` (never hardcoded) so the card follows the
 * configured UI language.
 */
export function buildTaskGroups(tasks: Task[], labels: TaskGroupLabels): TaskGroup[] {
    const all = Array.isArray(tasks) ? tasks : [];
    // Inlined (not a module-scope helper) so the whole function survives the
    // `.toString()` injection into the webview.
    const letter = (t: Task): string => (t.priority || '').trim().toUpperCase();
    const groups: TaskGroup[] = [
        { key: 'a', title: labels.a, items: all.filter((t) => letter(t) === 'A') },
        { key: 'b', title: labels.b, items: all.filter((t) => letter(t) === 'B') },
        { key: 'c', title: labels.c, items: all.filter((t) => letter(t) === 'C') },
        {
            key: 'none',
            title: labels.none,
            items: all.filter((t) => !['A', 'B', 'C'].includes(letter(t)))
        }
    ];
    return groups.filter((g) => g.items.length > 0);
}
