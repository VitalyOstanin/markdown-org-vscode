/**
 * The files a rendered agenda payload was built from.
 *
 * `AgendaData` is one of two shapes -- a list of days, each with up to four
 * task buckets, or a flat task list -- and both carry the same `file` field per
 * task. Walking them here keeps the panel from having to know which shape it is
 * holding, and keeps the walk unit-testable.
 *
 * Order of first appearance is preserved and duplicates are dropped: a day view
 * repeats one source file across every task it holds, and the git status counts
 * files.
 */
import type { AgendaData, DayAgenda, Task } from '../../types';

/** Unique source paths in the order they first appear. */
export function agendaSourceFiles(data: AgendaData): string[] {
    // The extractor always emits `file`, but the payload crosses a JSON
    // boundary; an empty or missing path is skipped rather than resolved
    // against the workspace root by accident.
    return distinctTaskValues(data, (task) => task.file);
}

/**
 * Unique scan roots in the order they first appear.
 *
 * The extractor emits `root` only when the run swept several directories, so a
 * single-directory agenda yields an empty list -- which is exactly what "there
 * are no collections to tell apart" means to the caller
 * (`buildCollectionMarks`).
 */
export function agendaSourceRoots(data: AgendaData): string[] {
    return distinctTaskValues(data, (task) => task.root);
}

/** One walk over either payload shape, collecting one field per task. */
function distinctTaskValues(data: AgendaData, pick: (task: Task) => string | undefined): string[] {
    const seen = new Set<string>();
    const values: string[] = [];
    const add = (task: Task): void => {
        const value = pick(task);
        if (typeof value !== 'string' || value === '' || seen.has(value)) {
            return;
        }
        seen.add(value);
        values.push(value);
    };

    for (const entry of data) {
        if (isDayAgenda(entry)) {
            for (const bucket of [entry.overdue, entry.scheduled_timed, entry.scheduled_no_time, entry.upcoming]) {
                for (const task of bucket ?? []) {
                    add(task);
                }
            }
        } else {
            add(entry);
        }
    }
    return values;
}

/**
 * A day entry carries `date` and no `heading`; a task carries `heading`. The
 * two never mix within one payload, but the union is resolved per entry rather
 * than by sampling the first one -- an empty leading bucket would make a sample
 * meaningless.
 */
function isDayAgenda(entry: DayAgenda | Task): entry is DayAgenda {
    return 'date' in entry && !('heading' in entry);
}
