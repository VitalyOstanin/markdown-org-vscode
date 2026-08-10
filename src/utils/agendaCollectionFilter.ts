/**
 * Turning part of a multi-directory agenda off for a while.
 *
 * The first of the two levels the agenda is narrowed by: which directories are
 * on screen. It answers without asking the extractor again -- the rows are
 * already in hand, and walking the directories over a tap on a chip would put a
 * filesystem walk behind a toggle. The second level, which notes of what is on
 * screen, is `tagFilter`.
 *
 * `hideCollections` runs on the extension host in the tests and in the page at
 * run time; `renderCollectionChips` is inlined into the page through
 * `Function.prototype.toString()`, so its body may only touch its own
 * parameters -- no module-scope imports (the type imports below are erased at
 * compile time).
 */

import type { AgendaData, DayAgenda, Task } from '../types';
import type { CollectionMark } from './agendaCollections';

/**
 * The same agenda without the rows of the roots named in `hidden`.
 *
 * A row whose root is not among them stays, which covers the row that carries
 * no root at all: a single-directory agenda reports none, and there is nothing
 * on that screen to tell such a row apart from.
 *
 * The day/task discrimination is spelled out inline rather than delegated to a
 * type-guard of its own: this body is inlined into the page verbatim, and a
 * function it calls that is not itself inlined is simply not defined there --
 * the chip would then repaint and the rows behind it would not.
 */
export function hideCollections(data: AgendaData, hidden: readonly string[]): AgendaData {
    if (hidden.length === 0) {
        return data;
    }
    const keep = (task: Task) => typeof task.root !== 'string' || !hidden.includes(task.root);
    const first = data[0];

    if (first !== undefined && 'date' in first) {
        return (data as DayAgenda[]).map((day) => ({
            ...day,
            overdue: (day.overdue ?? []).filter(keep),
            scheduled_timed: (day.scheduled_timed ?? []).filter(keep),
            scheduled_no_time: (day.scheduled_no_time ?? []).filter(keep),
            upcoming: (day.upcoming ?? []).filter(keep)
        }));
    }
    return (data as Task[]).filter(keep);
}

/**
 * The row of chips, one per scanned directory, or nothing while there is one.
 *
 * The colour of a chip is the colour of the dot the rows of that directory
 * carry, so the two read as the same thing said twice rather than as two
 * palettes. A chip that is off keeps its colour and loses its fill, which is
 * what a filter chip does in the Android client.
 */
export function renderCollectionChips(
    marks: readonly CollectionMark[],
    hidden: readonly string[],
    ctx: {
        /** `{0}` is the collection name. */
        chipTitle: string;
        escapeHtml: (text: string | number | boolean | undefined | null) => string;
        formatString: (template: string, ...values: string[]) => string;
    }
): string {
    if (marks.length === 0) {
        return '';
    }
    const chips = marks
        .map((mark) => {
            const off = hidden.includes(mark.root);
            const title = ctx.escapeHtml(ctx.formatString(ctx.chipTitle, mark.name));
            return (
                `<button type="button" class="collection-chip${off ? ' off' : ''}"` +
                ` data-root="${ctx.escapeHtml(mark.root)}" data-tone="${mark.tone}" title="${title}">` +
                `<span class="collection-chip-dot"></span>${ctx.escapeHtml(mark.name)}</button>`
            );
        })
        .join('');
    return `<div class="collection-chips" id="collection-chips">${chips}</div>`;
}
