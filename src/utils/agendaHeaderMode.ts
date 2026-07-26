/**
 * Which layout the sticky agenda header uses.
 *
 * The full header spends roughly a fifth of a short panel on chrome: a control
 * row plus a hero line with a large weekday/month title. On a panel docked to
 * the side or split horizontally that leaves little room for the tasks it is
 * introducing. The compact layout puts the title on the control row and tightens
 * the type and spacing.
 *
 * `auto` decides from the panel height, which is what the setting is about in
 * the first place; `full` and `compact` pin it. Pure and vscode-free (and free
 * of imports) because it is inlined into the webview via `.toString()`.
 */
export type AgendaHeaderMode = 'auto' | 'full' | 'compact';

/**
 * Panel height at or below which `auto` switches to the compact header, used
 * only when the header has not been measured yet. Chosen against the header's
 * own size: the full header is ~110px, so at 520px it is about a fifth of the
 * panel -- the point the backlog entry described as the problem.
 */
export const COMPACT_HEADER_MAX_HEIGHT = 520;

/**
 * Share of the panel the header may take before `auto` goes compact, and the
 * lower share at which it comes back. Two values, not one: with a single
 * threshold, dragging the editor split across it flips the layout on every
 * pixel. Between the two the current layout is kept.
 */
export const COMPACT_ENTER_RATIO = 0.2;
export const COMPACT_EXIT_RATIO = 0.15;

/** What the page knows about the header when it asks for a layout. */
export interface HeaderLayoutContext {
    /**
     * Height in px of the header **in its full layout**; 0 or absent means
     * "never measured in that layout". Always the full one, whichever layout is
     * on screen: it is the cost the compact layout exists to avoid, so it is
     * the only height both thresholds can be read against.
     */
    headerHeight?: number;
    /** The layout currently applied, which the hysteresis band keeps. */
    current?: 'full' | 'compact';
    /** Fallback panel-height threshold for an unmeasured header. */
    threshold?: number;
    enterRatio?: number;
    exitRatio?: number;
}

/** Accept only the three documented values; anything else means `auto`. */
export function normalizeHeaderMode(value: string | undefined): AgendaHeaderMode {
    return value === 'full' || value === 'compact' ? value : 'auto';
}

/**
 * The next value of `markdown-org.agendaHeaderMode` when the panel button or
 * the command cycles it: `auto` -> `full` -> `compact` -> `auto`.
 *
 * A cycle rather than a two-way toggle, because `auto` is the default and a
 * toggle between the two pinned layouts would make it unreachable from the
 * panel -- a user who pinned one would have to go back to the settings editor
 * to get the automatic behaviour again.
 *
 * The normalisation is spelled out rather than delegated to
 * {@link normalizeHeaderMode} for the reason given inside
 * {@link resolveHeaderLayout}: this function is inlined into the webview by
 * `.toString()`, where a call to a sibling helper is an undefined name. The
 * unit tests hold the two to the same answers.
 */
export function nextHeaderMode(value: string | undefined): AgendaHeaderMode {
    if (value === 'full') {
        return 'compact';
    }
    if (value === 'compact') {
        return 'auto';
    }
    return 'full';
}

/**
 * The layout to render: `auto` resolves against the panel, the other two are
 * returned as they are. A non-finite or non-positive height (a panel that has
 * not been laid out yet) resolves to `full`, so the panel never opens compact
 * and then jumps.
 *
 * `auto` decides by the share of the panel the **full** header takes, once the
 * page has measured it: the complaint was never "the panel is under 520px", it
 * was "the header eats a fifth of it", and how tall the header is depends on
 * the editor font size. Without a measurement it falls back to the panel-height
 * threshold. The two ratios form a hysteresis band so dragging the editor split
 * across the boundary does not flip the layout on every pixel.
 *
 * The share is of the full header even while the compact one is on screen: the
 * compact header is a third of the height, so its own share falls under the
 * exit ratio at every size that made it turn on, and reading the band against
 * it would return the panel to full on the very next recompute -- then compact,
 * then full, once per resize event.
 */
export function resolveHeaderLayout(
    mode: string | undefined,
    viewportHeight: number,
    // Deliberately literals and not the exported consts: this function is
    // inlined into the webview by `.toString()`, and the CommonJS emit reads an
    // exported const off the module object, which does not exist in the page
    // (the load fails outright). They are kept in step by the unit tests, which
    // resolve at the exported values.
    context: {
        headerHeight?: number;
        current?: 'full' | 'compact';
        threshold?: number;
        enterRatio?: number;
        exitRatio?: number;
    } = {}
): 'full' | 'compact' {
    const threshold = context.threshold ?? 520;
    const enterRatio = context.enterRatio ?? 0.2;
    const exitRatio = context.exitRatio ?? 0.15;
    // Inlined rather than delegated to normalizeHeaderMode for the same reason
    // as the literal above: only this function's own source is shipped to the
    // page, so a call to a sibling helper would be an undefined name there.
    // `normalizeHeaderMode` stays the host-side entry point, and the unit tests
    // hold the two to the same answers.
    if (mode === 'full' || mode === 'compact') {
        return mode;
    }
    // `Number.isFinite` rather than the global: the global coerces, so the
    // string "520" that a `getBoundingClientRect` shim could hand over would
    // pass as a height. It also rejects NaN, which is why the size check below
    // can be the plain comparison it reads as.
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
        return 'full';
    }
    const headerHeight = context.headerHeight;
    if (!Number.isFinite(headerHeight) || !headerHeight || headerHeight <= 0) {
        // Nothing measured yet (first paint): fall back to the panel height.
        return viewportHeight <= threshold ? 'compact' : 'full';
    }
    const share = headerHeight / viewportHeight;
    if (share >= enterRatio) {
        return 'compact';
    }
    if (share < exitRatio) {
        return 'full';
    }
    // Inside the band: whatever is on screen stays on, so a panel resized back
    // and forth across one ratio does not flip layouts with it.
    return context.current === 'compact' ? 'compact' : 'full';
}
