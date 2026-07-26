/**
 * Escape a value for interpolation into the agenda webview's HTML.
 *
 * Task data comes from the extractor, i.e. from whatever the user's markdown
 * files and their names contain, and the renderer puts it into both element
 * text and *quoted attributes* (`data-file`, `data-priority`, `title`, ...).
 * Quotes therefore have to be escaped as well: a value able to close its
 * attribute can inject another one, and a duplicate attribute wins over the
 * real one when the browser parses the tag -- a file name carrying `"` could
 * override `data-line` and send a click to a different location.
 *
 * The webview used a `document.createElement` + `textContent` -> `innerHTML`
 * round-trip, which leaves `"` and `'` untouched and allocates an element per
 * call (10-12 calls per rendered task line). This string replacement covers
 * all five characters and does no DOM work.
 *
 * `&` is replaced first, otherwise the ampersands introduced by the later
 * replacements would be escaped again (`<` -> `&amp;lt;`).
 *
 * Inlined into the webview via `.toString()`, so the body must stay
 * self-contained: no imports, no module-level helpers.
 */
export function escapeHtml(text: string | undefined | null): string {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
