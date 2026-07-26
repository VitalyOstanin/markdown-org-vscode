/**
 * Browser-style navigation history for the agenda view. Records the sequence of
 * view states the user visited -- {mode, date} -- so Back/Forward can restore a
 * previous state, exactly like a web browser's history stack.
 *
 * A "state" is the mode (day/week/month/tasks) plus the anchor date the view is
 * built around (shiftedToday). Every user navigation records a state: switching
 * mode, clicking a weekday to open its day, and Prev/Next/Today all push. A
 * passive re-render that lands on the identical state (file-watcher refresh, a
 * repeated Show Agenda) is de-duplicated, so it does not bloat the stack.
 *
 * Pure and unit-tested here; AgendaPanel owns a single instance and performs the
 * actual re-render side effect when Back/Forward return a state.
 */
export interface AgendaViewState {
    mode: string;
    /** Anchor date `YYYY-MM-DD` (shiftedToday). */
    date: string;
}

function sameState(a: AgendaViewState | undefined, b: AgendaViewState): boolean {
    return !!a && a.mode === b.mode && a.date === b.date;
}

export class AgendaHistory {
    private stack: AgendaViewState[] = [];
    private cursor = -1;

    /**
     * Record a visited state. No-op (returns false) when it equals the current
     * entry -- a passive refresh or a repeat should not create a duplicate.
     * Otherwise any forward entries are dropped (a new branch replaces the
     * redo tail, like a browser), the state is pushed, and the cursor advances.
     */
    record(state: AgendaViewState): boolean {
        if (sameState(this.stack[this.cursor], state)) {
            return false;
        }
        this.stack = this.stack.slice(0, this.cursor + 1);
        this.stack.push({ mode: state.mode, date: state.date });
        this.cursor = this.stack.length - 1;
        return true;
    }

    canGoBack(): boolean {
        return this.cursor > 0;
    }

    canGoForward(): boolean {
        return this.cursor < this.stack.length - 1;
    }

    /** Step the cursor back one entry and return it, or undefined at the start. */
    back(): AgendaViewState | undefined {
        if (!this.canGoBack()) {
            return undefined;
        }
        this.cursor -= 1;
        return this.stack[this.cursor];
    }

    /** Step the cursor forward one entry and return it, or undefined at the end. */
    forward(): AgendaViewState | undefined {
        if (!this.canGoForward()) {
            return undefined;
        }
        this.cursor += 1;
        return this.stack[this.cursor];
    }

    current(): AgendaViewState | undefined {
        return this.stack[this.cursor];
    }

    /** Reset the history (e.g. when the agenda panel is disposed). */
    clear(): void {
        this.stack = [];
        this.cursor = -1;
    }

    /** Number of recorded states (for tests / diagnostics). */
    get length(): number {
        return this.stack.length;
    }
}
