/**
 * Hero-header model for the agenda nav-bar (Nav "A": a large title with a
 * weekday/date subtitle and a "TODAY" badge, a mode segment, and compact
 * date navigation).
 *
 * Only the mode-independent decisions live here so they can be unit-tested
 * without a DOM or Intl:
 *
 *  - `kind` selects which title/subtitle shape the webview formats:
 *    `date`  -> big weekday + "D Month YYYY" subtitle (day / week views),
 *    `month` -> month name + year subtitle (month view),
 *    `tasks` -> a static "Tasks" title, no date subtitle (tasks view).
 *  - `showToday` drives the "TODAY" badge: true when the anchor the panel is
 *    built around still points at the current day (date kind) or the current
 *    month (month kind). The badge never shows in tasks mode.
 *
 * Intl formatting of the actual title/subtitle text stays in the webview,
 * which owns the locale; this function only compares ISO date strings.
 *
 * Embedded into the webview via `.toString()`, so the unit tests here
 * transitively cover the runtime behaviour. Keep it self-contained: it may
 * only touch its parameters, never module-scope imports.
 */
export type HeroKind = 'date' | 'month' | 'tasks';

export interface HeroModel {
    kind: HeroKind;
    showToday: boolean;
}

/**
 * @param mode         Active agenda mode (`day` / `week` / `month` / `tasks`).
 * @param shiftedToday Anchor date the panel is built around, `YYYY-MM-DD`
 *                     (today plus any Prev/Next offset).
 * @param todayIso     The actual current local date, `YYYY-MM-DD`.
 */
export function resolveHeroModel(mode: string, shiftedToday: string, todayIso: string): HeroModel {
    if (mode === 'tasks') {
        return { kind: 'tasks', showToday: false };
    }
    if (mode === 'month') {
        // Same month iff the leading `YYYY-MM` of both anchors matches.
        return { kind: 'month', showToday: shiftedToday.slice(0, 7) === todayIso.slice(0, 7) };
    }
    // day / week (and any unknown mode) -> exact-day comparison.
    return { kind: 'date', showToday: shiftedToday === todayIso };
}
