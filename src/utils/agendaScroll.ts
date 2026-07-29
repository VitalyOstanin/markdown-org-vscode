/**
 * Per-anchor scroll memory used by the agenda webview to handle the
 * round-trip case (e.g. Next Week then Prev Week back to the current week).
 *
 * Without it, every navigation jumps the user to today's header in the
 * week view, which discards any manual scroll they did before navigating.
 *
 * Keys are agenda anchor strings (the `shiftedToday` ISO date the panel
 * is currently built around). Values are `window.scrollY` snapshots.
 *
 * The webview embeds the source of `rememberScroll` and `recallScroll`
 * via `.toString()`, so the unit tests on these functions transitively
 * cover the runtime behaviour.
 */
export type ScrollMemory = Record<string, number>;

/**
 * Save `scrollY` for `anchor`. No-op when `anchor` is empty (the webview
 * has no anchor on the very first message before init completes).
 */
export function rememberScroll(history: ScrollMemory, anchor: string, scrollY: number): void {
    if (!anchor) {
        return;
    }
    history[anchor] = scrollY;
}

/**
 * Return the previously stored scroll Y for `anchor`, or `null` when this
 * anchor has not been visited yet. `null` signals "no memory, use the
 * default behaviour (scroll to today's header)" to the caller.
 *
 * Uses `Object.prototype.hasOwnProperty.call` to be safe against inherited
 * keys -- the agenda anchor is an ISO date string and unlikely to collide,
 * but the cost is negligible.
 */
export function recallScroll(history: ScrollMemory, anchor: string): number | null {
    if (!anchor) {
        return null;
    }
    if (!Object.prototype.hasOwnProperty.call(history, anchor)) {
        return null;
    }
    return history[anchor] ?? null;
}

/** The window methods `focusStickyAnchor` needs, structurally typed for fakes. */
export interface ScrollWindowLike {
    scrollTo(x: number, y: number): void;
}

/** The element method it needs; a real Element satisfies it. */
export interface StickyAnchorLike {
    scrollIntoView(options: { block: 'start'; behavior: 'auto' }): void;
}

/**
 * Scroll `target` to just under the sticky header, and to the top of the page
 * when there is no target.
 *
 * The reset to 0 is what makes this correct rather than a plain
 * `scrollIntoView`. A `position: sticky` element that is already pinned
 * reports its PINNED box: `getBoundingClientRect().top` (and `offsetTop`)
 * return where it is stuck, not where it sits in the flow. `scrollIntoView`
 * measures that box, concludes the element is already where `scroll-margin-top`
 * wants it, and moves the page by the one pixel the two differ by -- leaving
 * the page scrolled deeper than intended, with the day's first rows hidden
 * behind the header that is supposedly at the top of them.
 *
 * Scrolling to 0 first unpins every header, so the measurement `scrollIntoView`
 * then makes is the flow one. Both happen inside a single frame, so nothing is
 * painted in between and the user sees one jump, not two.
 *
 * Inlined into the webview via `.toString()`, so it must stay self-contained.
 */
export function focusStickyAnchor(win: ScrollWindowLike, target: StickyAnchorLike | null): void {
    win.scrollTo(0, 0);
    if (target) {
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
}
