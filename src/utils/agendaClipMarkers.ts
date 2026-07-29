/**
 * Week-view clipping markers: how much of a day is out of sight.
 *
 * A week can hold more rows than the panel is tall, and the day header is
 * sticky -- once the user scrolls into a day, its first rows disappear BEHIND
 * that header rather than above the window, which reads as "this day starts
 * here" instead of "this day continues above". These helpers count the rows
 * hidden on each side and drive the two chips the header shows for them.
 *
 * Everything here is embedded into the webview via `.toString()`, so each
 * function must stay self-contained: it may only touch its parameters and DOM
 * APIs, never module-scope imports or its neighbours in this file (see
 * `updateDayClipMarkers`, which takes the counter as a parameter for exactly
 * that reason).
 */

/** A row's vertical extent in viewport coordinates (a DOMRect satisfies it). */
export interface ClipRectLike {
    top: number;
    bottom: number;
}

/** Rows of one day that are out of sight, split by which edge hides them. */
export interface ClipCounts {
    above: number;
    below: number;
}

/**
 * Count the rows of one day that the user cannot see.
 *
 * `above` are the rows the sticky day header covers -- their bottom edge is at
 * or over the header's bottom edge, which includes everything scrolled past
 * the top of the window. `below` are the rows that start at or under the
 * bottom edge of the viewport. A row that is partly visible counts as visible:
 * the chips answer "is any task of this day entirely out of view", and a half
 * row still shows its text.
 *
 * The half-pixel slack absorbs sub-pixel layout: a row parked exactly under
 * the header lands on 0.3px differences between browsers and zoom levels, and
 * a chip that flickers between 0 and 1 while nothing moves is worse than one
 * that resolves the tie towards "visible".
 */
export function countClippedRows(rows: ClipRectLike[], headerBottom: number, viewportHeight: number): ClipCounts {
    let above = 0;
    let below = 0;
    for (const row of rows) {
        if (row.bottom <= headerBottom + 0.5) {
            above++;
        } else if (row.top >= viewportHeight - 0.5) {
            below++;
        }
    }
    return { above: above, below: below };
}

/** The two chips a day header carries, empty until a measurement fills them. */
export function renderDayClipHtml(): string {
    return (
        '<span class="day-clip">' +
        '<span class="day-clip-count day-clip-above" hidden></span>' +
        '<span class="day-clip-count day-clip-below" hidden></span>' +
        '</span>'
    );
}

/** Minimal shape of a chip element inside a day header. */
export interface ClipChipLike {
    textContent: string | null;
    hidden: boolean;
    setAttribute(name: string, value: string): void;
}

/** Minimal shape of a node the marker pass walks over. */
export interface ClipNodeLike {
    classList: { contains(token: string): boolean; toggle(token: string, force: boolean): void };
    getBoundingClientRect(): ClipRectLike;
    querySelector(selectors: string): ClipChipLike | null;
    nextElementSibling: ClipNodeLike | null;
}

/** Root that can query for day-header elements (a Document or a container). */
export interface ClipRootLike {
    querySelectorAll(selectors: string): Iterable<ClipNodeLike>;
}

/**
 * Refresh every day header's clipping chips against the current scroll
 * position.
 *
 * The week view renders as a flat sequence -- a `.day-header` followed by that
 * day's `.task-line` rows, then the next header -- so a day's rows are the
 * siblings up to the next header rather than children of a wrapper.
 *
 * `countRows` and `format` arrive as parameters because this function is
 * inlined into the page, where module bindings do not exist; the webview
 * passes its own embedded copies of `countClippedRows` and `formatString`.
 * Headers whose day has no hidden rows keep both chips hidden, so the marker
 * only appears when it has something to report.
 */
export function updateDayClipMarkers(
    root: ClipRootLike,
    viewportHeight: number,
    titles: { above: string; below: string },
    countRows: (rows: ClipRectLike[], headerBottom: number, viewportHeight: number) => ClipCounts,
    format: (template: string, ...values: string[]) => string
): void {
    const headers = root.querySelectorAll('.day-header[data-date]');
    for (const header of headers) {
        const rows: ClipRectLike[] = [];
        let node = header.nextElementSibling;
        while (node && !node.classList.contains('day-header')) {
            if (node.classList.contains('task-line')) {
                rows.push(node.getBoundingClientRect());
            }
            node = node.nextElementSibling;
        }
        const counts = countRows(rows, header.getBoundingClientRect().bottom, viewportHeight);
        // The shadow under the header is the peripheral half of the marker: it
        // says "this day continues above" without the reader having to look at
        // the number.
        header.classList.toggle('day-header-clipped', counts.above > 0);
        const above = header.querySelector('.day-clip-above');
        if (above) {
            above.hidden = counts.above === 0;
            above.textContent = '↑ ' + String(counts.above);
            above.setAttribute('title', format(titles.above, String(counts.above)));
        }
        const below = header.querySelector('.day-clip-below');
        if (below) {
            below.hidden = counts.below === 0;
            below.textContent = '↓ ' + String(counts.below);
            below.setAttribute('title', format(titles.below, String(counts.below)));
        }
    }
}
