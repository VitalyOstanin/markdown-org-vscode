/**
 * Which way a task's date points relative to the day the view is anchored on.
 *
 * The Day and Week cards get this from the bucket a row sits in -- the
 * extractor has already decided what is overdue and what is upcoming. The
 * Tasks card has no anchor of its own: it lists tasks of every date at once,
 * so the direction has to be read off the date itself.
 *
 * Same inlining rule as the sibling `agenda*.ts` helpers: the body is embedded
 * into the webview through `Function.prototype.toString()`, so it may only
 * touch its own parameters. No value imports -- a cross-module call compiles
 * to `module_1.fn`, undefined in the page.
 */
import type { Task } from '../types';

/** `data-dir` values a row's date column can carry. */
export type TaskDateDirection = 'overdue' | 'today' | 'upcoming';

/**
 * `undefined` for a task with no date: there is nothing to point with, and the
 * column stays empty. Both dates are ISO (`YYYY-MM-DD`), which compares as
 * text in date order, so no `Date` is built per row.
 */
export function taskDateDirection(task: Task, anchorIso: string): TaskDateDirection | undefined {
    const date = task.timestamp_date;
    if (typeof date !== 'string' || date === '') {
        return undefined;
    }
    if (date < anchorIso) {
        return 'overdue';
    }
    return date > anchorIso ? 'upcoming' : 'today';
}
