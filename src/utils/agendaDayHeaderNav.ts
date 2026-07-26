/**
 * Minimal element shape for a clickable day-header, structurally typed so
 * jsdom (and plain fakes) satisfy it without pulling in the DOM lib.
 */
export interface DayHeaderElementLike {
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    classList: { add(token: string): void };
    addEventListener(type: 'click', listener: () => void): void;
}

/** Root that can query for day-header elements (a Document or a container). */
export interface DayHeaderRootLike {
    querySelectorAll(selectors: string): ArrayLike<DayHeaderElementLike>;
}

/**
 * Make week-view day-headers act as drill-down links into the Day view.
 *
 * In week mode every day gets a `.day-header[data-date="YYYY-MM-DD"]`
 * heading. This wires a click on that heading to `onNavigate(date)` (the
 * webview passes its `navigateToDay`, which reopens the agenda in Day mode
 * for that date), tags the heading with `day-header-link` so the CSS can show
 * a pointer affordance, and adds the caller-supplied `title` tooltip
 * explaining the drill-down (the wording comes from the active UI language,
 * see agendaI18n.ts).
 *
 * Only week mode is wired: Day mode's single header would just reopen the
 * same day, Month uses `.calendar-day` cells, and Tasks headers carry no
 * `data-date`. Headers whose `data-date` is empty are skipped. Returns the
 * number of headers wired (for tests).
 *
 * Embedded into the webview via `.toString()`, so the unit tests here
 * transitively cover the runtime behaviour. Keep it self-contained: it may
 * only touch its parameters and DOM APIs, never module-scope imports.
 */
export function wireDayHeaderNavigation(
    root: DayHeaderRootLike,
    mode: string,
    onNavigate: (date: string) => void,
    title: string
): number {
    if (mode !== 'week') {
        return 0;
    }
    const headers = root.querySelectorAll('.day-header[data-date]');
    let wired = 0;
    for (let i = 0; i < headers.length; i++) {
        const el = headers[i];
        const date = el.getAttribute('data-date');
        if (!date) {
            continue;
        }
        el.classList.add('day-header-link');
        el.setAttribute('title', title);
        el.addEventListener('click', function () {
            onNavigate(date);
        });
        wired++;
    }
    return wired;
}
