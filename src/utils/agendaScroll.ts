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
export type ScrollMemory = { [anchor: string]: number };

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
    if (Object.prototype.hasOwnProperty.call(history, anchor)) {
        return history[anchor];
    }
    return null;
}
