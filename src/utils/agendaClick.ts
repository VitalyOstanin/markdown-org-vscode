/**
 * Minimal selection shape (what `window.getSelection()` returns at runtime).
 * Typed structurally so unit tests can pass plain objects without the DOM.
 */
export interface SelectionLike {
    readonly isCollapsed: boolean;
    toString(): string;
}

/**
 * Defense-in-depth sanitizer for `task.line` before it is interpolated into
 * the `data-line` HTML attribute in the agenda webview.
 *
 * The extractor contract has `Task.line: number`, but the webview must never
 * trust that: a payload string like `1" onmouseover="x` would break out of
 * the attribute. The result here is always a finite non-negative integer,
 * safe to interpolate without HTML-escaping. `resolveTaskClickIntent`
 * additionally re-parses the attribute with parseInt, so this is layered
 * with the existing parse-time guard.
 *
 * Embedded into the webview via `.toString()` (same approach used for
 * `resolveTaskClickIntent`), and unit-tested in agendaClick.test.ts.
 */
export function sanitizeTaskLine(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        return 0;
    }
    return Math.trunc(n);
}

/**
 * Returns true when there is a meaningful (non-collapsed, non-empty) text
 * selection.
 *
 * Used by the agenda webview to ignore the click that arrives at the end
 * of a touchpad selection drag (double-tap, then drag, then release).
 * Without this guard that click would open the highlighted task instead
 * of completing the selection.
 *
 * The agenda's HTML embeds this function's source via `.toString()`, so
 * unit tests of this function transitively cover the webview behaviour.
 */
export function isMeaningfulSelection(sel: SelectionLike | null): boolean {
    return !!(sel && !sel.isCollapsed && sel.toString().length > 0);
}

/**
 * Structural subset of a DOM element with the methods we read here. Keeps
 * this file free of a `lib: ["dom"]` TS dependency so it can be unit-tested
 * in plain Node.
 */
export interface ClickTargetLike {
    closest(selector: string): ClickTargetLike | null;
    getAttribute(name: string): string | null;
}

/** Minimal subset of `MouseEvent` needed by `resolveTaskClickIntent`. */
export interface ClickEventLike {
    readonly target: ClickTargetLike | null;
}

/** Task reference posted back to the extension host on click. */
export interface TaskRef {
    readonly file: string;
    readonly line: number;
}

/**
 * Decide what (if anything) a click inside the agenda content area means.
 *
 * Returns `null` when:
 *   - there is an active text selection (user was selecting, not clicking),
 *   - the click did not land on a `.task-line`,
 *   - the target task-line is missing `data-file` / `data-line` attributes,
 *   - `data-line` is not a valid integer.
 *
 * Returns the task reference to open otherwise. The agenda webview embeds
 * this function's source via `.toString()`, so the jsdom test on this
 * function exercises the same code that ships to the user.
 */
export function resolveTaskClickIntent(event: ClickEventLike, selection: SelectionLike | null): TaskRef | null {
    if (isMeaningfulSelection(selection)) {
        return null;
    }
    const target = event.target ? event.target.closest('.task-line') : null;
    if (!target) {
        return null;
    }
    const file = target.getAttribute('data-file');
    const lineStr = target.getAttribute('data-line');
    if (!file || lineStr === null) {
        return null;
    }
    const line = parseInt(lineStr, 10);
    if (Number.isNaN(line)) {
        return null;
    }
    return { file, line };
}
