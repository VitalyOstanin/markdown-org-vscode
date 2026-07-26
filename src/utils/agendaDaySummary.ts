import { DayAgenda, TaskWithOffset } from '../types';

/**
 * Day-view card model: the summary counts and the ordered sections the Day
 * agenda renders as stacked panels.
 *
 * The Day view groups a single day's four extractor buckets (`overdue`,
 * `scheduled_timed`, `scheduled_no_time`, `upcoming`) into three panels and a
 * one-line summary. The Overdue panel is rendered LAST (at the bottom) by
 * design, so a day's actionable "today" work reads first and the backlog sits
 * underneath.
 *
 * Both helpers are pure and unit-tested here, then embedded into the webview
 * via `.toString()`, so these tests transitively cover the runtime behaviour.
 * Keep them self-contained: they may only touch their parameters, never
 * module-scope imports (the `DayAgenda`/`TaskWithOffset` imports are types,
 * erased at compile time and absent from the `.toString()` body).
 */

/** Per-day headline counts shown in the card's summary line. */
export interface DaySummary {
    /** Total tasks across all four buckets. */
    total: number;
    /** Tasks in the overdue bucket. */
    overdue: number;
    /** Tasks whose `task_type` is `DONE`, across all buckets. */
    done: number;
}

/**
 * Which bucket a task came from, so the webview can pass the matching
 * `taskType` to `renderTask` (drives the offset colour and attention level):
 * `overdue` and `upcoming` map to their eponymous task types; the two
 * scheduled buckets pass no task type (undefined at the call site).
 */
export type DaySectionItemKind = 'overdue' | 'timed' | 'notime' | 'upcoming';

export interface DaySectionItem {
    task: TaskWithOffset;
    kind: DaySectionItemKind;
}

export interface DaySection {
    /** Stable key for markup hooks (`scheduled` / `allday` / `overdue`). */
    key: 'scheduled' | 'allday' | 'overdue';
    /** Human-readable panel title, in the active UI language. */
    title: string;
    items: DaySectionItem[];
}

/** Panel titles, supplied by the caller (see `AgendaStrings.sections`). */
export interface DaySectionLabels {
    scheduled: string;
    allday: string;
    overdue: string;
}

type BucketName = 'overdue' | 'scheduled_timed' | 'scheduled_no_time' | 'upcoming';

export function computeDaySummary(day: DayAgenda): DaySummary {
    // Week/month payloads may omit empty buckets (see DayAgenda docs), so each
    // access is defaulted to an empty array. Inlined (not a module-scope
    // helper) so the whole function survives `.toString()` injection into the
    // webview, which has no access to module-scope symbols.
    const b = (name: BucketName): TaskWithOffset[] => (Array.isArray(day[name]) ? day[name] : []);
    const all = [...b('overdue'), ...b('scheduled_timed'), ...b('scheduled_no_time'), ...b('upcoming')];
    return {
        total: all.length,
        overdue: b('overdue').length,
        done: all.filter((t) => t.task_type === 'DONE').length
    };
}

/**
 * Ordered, non-empty sections for the card. Order is fixed:
 *   1. Scheduled today   (scheduled_timed)
 *   2. All-day & upcoming (scheduled_no_time + upcoming)
 *   3. Overdue           (overdue) -- LAST, at the bottom.
 * Empty sections are dropped so the card never shows a "(0)" panel.
 *
 * The titles come in as `labels` (never hardcoded) so the card follows the
 * configured UI language.
 */
export function buildDaySections(day: DayAgenda, labels: DaySectionLabels): DaySection[] {
    // See computeDaySummary: inline bucket accessor, self-contained for the
    // `.toString()` webview injection.
    const b = (name: BucketName): TaskWithOffset[] => (Array.isArray(day[name]) ? day[name] : []);
    const timed = b('scheduled_timed').map((task): DaySectionItem => ({ task, kind: 'timed' }));
    const noTime = b('scheduled_no_time').map((task): DaySectionItem => ({ task, kind: 'notime' }));
    const upcoming = b('upcoming').map((task): DaySectionItem => ({ task, kind: 'upcoming' }));
    const overdue = b('overdue').map((task): DaySectionItem => ({ task, kind: 'overdue' }));

    const sections: DaySection[] = [
        { key: 'scheduled', title: labels.scheduled, items: timed },
        { key: 'allday', title: labels.allday, items: [...noTime, ...upcoming] },
        { key: 'overdue', title: labels.overdue, items: overdue }
    ];
    return sections.filter((s) => s.items.length > 0);
}
