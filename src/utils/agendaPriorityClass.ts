/**
 * Derive the CSS class for a task's priority cell from the raw `priority`
 * value (which originates from the extractor, i.e. external input).
 *
 * The value is interpolated directly into a `class="..."` attribute in the
 * webview, so it must not be trusted verbatim: a value like `A" data-x="y`
 * would break out of the attribute. Only well-formed priority tokens
 * (ASCII letters/digits) produce a class; anything else yields `''`, so a
 * malformed/hostile value simply gets no priority styling rather than
 * injecting attributes.
 *
 * Shared with the webview via `.toString()` inlining in agendaPanel.ts and
 * unit-tested here.
 */
export function priorityClass(priority: string | undefined | null): string {
    if (!priority) {
        return '';
    }
    // Whitelist: org priorities are single letters (A/B/C…), but accept any
    // run of ASCII alphanumerics to stay forward-compatible without ever
    // allowing quotes, spaces, or angle brackets into the attribute.
    if (!/^[A-Za-z0-9]+$/.test(priority)) {
        return '';
    }
    return 'priority-' + priority.toLowerCase();
}
