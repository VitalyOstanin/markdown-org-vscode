import type { DayAgenda, TaskWithOffset } from '../types';

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

/**
 * Stable key for markup hooks.
 *
 * The overdue backlog is four keys rather than one: what a slipped entry asks
 * of the reader differs with its age, and they are shown apart because they are
 * acted on apart. A repeat missed on Tuesday is today's work, a date from May
 * wants a new one, and a date from three years ago wants to be closed. The same
 * split the Android client makes, and the same reason org-super-agenda keeps
 * `:scheduled past` apart from `:deadline past`.
 */
export type DaySectionKey =
    'scheduled' | 'allday' | 'overdue-repeat' | 'overdue-recent' | 'overdue-earlier' | 'overdue-long';

export interface DaySection {
    key: DaySectionKey;
    /** Human-readable panel title, in the active UI language. */
    title: string;
    items: DaySectionItem[];
}

/** One band's share of a date's overdue backlog, named in the active language. */
export interface OverdueBandCount {
    title: string;
    count: number;
}

/** Date (`YYYY-MM-DD`) -> its non-empty overdue bands, most-actionable first. */
export type OverdueBandIndex = Record<string, OverdueBandCount[]>;

/** Panel titles, supplied by the caller (see `AgendaStrings.sections`). */
export interface DaySectionLabels {
    scheduled: string;
    allday: string;
    /** One heading per overdue band; see {@link DaySectionKey}. */
    overdueRepeat: string;
    overdueRecent: string;
    overdueEarlier: string;
    overdueLong: string;
}

/** Slipped by no more than this, and it is still the current plan. */
export const OVERDUE_RECENT_DAYS = 7;

/** Beyond this the date says less than the fact that it is long gone. */
export const OVERDUE_LONG_AGO_DAYS = 365;

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
 *   1. At a set time      (scheduled_timed)
 *   2. All-day & upcoming (scheduled_no_time + upcoming)
 *   3. The overdue bands  (overdue) -- LAST, at the bottom.
 * Empty sections are dropped so the card never shows a "(0)" panel.
 *
 * The bands run most-actionable first — a missed repeat, then this week's
 * slippage, then the rest of the year, then what is older than that. That is
 * the order they are worth reading in rather than the order of the dates, which
 * is what buries a repeat missed yesterday under entries from 2021.
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
    // Inlined for the same reason as the accessor above -- and for the same
    // reason the two thresholds are written out as literals here: a module-level
    // constant is not carried into the page. `OVERDUE_RECENT_DAYS` and
    // `OVERDUE_LONG_AGO_DAYS` are where those numbers are named and explained,
    // and the tests read them from there; the two copies have to be changed
    // together, which nothing but this note enforces.
    //
    // A repeater wins over the age on purpose: whether its missed occurrence
    // was yesterday or last spring, what to do with it is the same — the next
    // occurrence is the work, and the dates behind it are gone whatever happens.
    const band = (item: DaySectionItem): DaySectionKey => {
        const off = item.task.days_offset ?? 0;
        if ((item.task.timestamp_repeater ?? '') !== '') {
            return 'overdue-repeat';
        }
        if (off >= -7) {
            return 'overdue-recent';
        }
        return off >= -365 ? 'overdue-earlier' : 'overdue-long';
    };

    const sections: DaySection[] = [
        { key: 'scheduled', title: labels.scheduled, items: timed },
        { key: 'allday', title: labels.allday, items: [...noTime, ...upcoming] },
        { key: 'overdue-repeat', title: labels.overdueRepeat, items: [] },
        { key: 'overdue-recent', title: labels.overdueRecent, items: [] },
        { key: 'overdue-earlier', title: labels.overdueEarlier, items: [] },
        { key: 'overdue-long', title: labels.overdueLong, items: [] }
    ];
    overdue.forEach((item) => {
        const key = band(item);
        const section = sections.find((s) => s.key === key);
        if (section) {
            section.items.push(item);
        }
    });
    return sections.filter((s) => s.items.length > 0);
}

/**
 * The overdue bands of every date in a month payload, as counts.
 *
 * The month grid shows a number per day and no rows at all, so the bands
 * cannot be drawn there the way the day and week views draw them. What it can
 * carry is the breakdown behind its red chip: whether those six missed entries
 * are two repeats to redo and four dates from last spring, or six of the same
 * thing. The split comes from `buildDaySections`, so the grid and the two
 * views that list the rows can never disagree about which band an entry is in.
 *
 * Dates with nothing overdue are omitted, like `buildMonthDayIndex` omits the
 * empty ones -- a missing key means "nothing to break down".
 */
export function buildOverdueBandIndex(days: DayAgenda[], labels: DaySectionLabels): OverdueBandIndex {
    const index: OverdueBandIndex = {};
    const list = Array.isArray(days) ? days : [];
    for (const day of list) {
        if (!day.date) {
            continue;
        }
        const bands = buildDaySections(day, labels)
            .filter((section) => section.key.startsWith('overdue-'))
            .map((section) => ({ title: section.title, count: section.items.length }));
        if (bands.length > 0) {
            index[day.date] = bands;
        }
    }
    return index;
}
