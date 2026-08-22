// Which occurrences a repeating entry does not have, for one run (no I/O).
//
// The same question markdown-org-extract answers for the agenda (extractor
// ADR-0031), asked again here because the calendar needs it in its own shape:
// an entry's rule is exported as an RRULE, and an occurrence the entry does
// not have has to leave with it as an EXDATE. Without that, the calendar keeps
// expanding the rule over a day the agenda has taken the entry off -- and,
// when the occurrence moved, keeps it beside the entry that replaced it, so
// the day holds two.
//
// There are two reasons an occurrence can be missing and they are collected
// the same way here, because the calendar treats them alike: the day loses the
// occurrence either way. What tells them apart -- who owes the arrears -- is
// an agenda question, and the calendar has no bucket for it.
import type { Task } from '../../types';

/** Series id -> the occurrence dates other entries of the run stand in for. */
export type ReplacedOccurrences = ReadonlyMap<string, ReadonlySet<string>>;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The date half of a `RECURRENCE_ID`, which is what occurrences match on. */
function occurrenceDate(recurrenceId: string): string | undefined {
    const [date] = recurrenceId.trim().split(/\s+/, 1);
    return date !== undefined && ISO_DATE_RE.test(date) ? date : undefined;
}

/**
 * Collect every `(SERIES_ID, RECURRENCE_ID)` pair in the run.
 *
 * Built from the whole task list because a replacement lives in an entry of
 * its own, possibly in another file: which occurrences one entry is missing
 * cannot be answered from that entry alone. An entry carrying only one half of
 * the pair replaces nothing and is skipped -- the extractor is the side that
 * reports it.
 */
export function collectReplacedOccurrences(tasks: readonly Task[]): ReplacedOccurrences {
    const replaced = new Map<string, Set<string>>();
    for (const task of tasks) {
        const series = task.series_id;
        const recurrence = task.recurrence_id;
        if (!series || !recurrence) {
            continue;
        }
        const date = occurrenceDate(recurrence);
        if (date === undefined) {
            continue;
        }
        const dates = replaced.get(series) ?? new Set<string>();
        dates.add(date);
        replaced.set(series, dates);
    }
    return replaced;
}

/**
 * Every occurrence `task` does not have: the dates it cancels itself, and the
 * ones entries of the run stand in for. Sorted, one entry per date.
 *
 * A date that is not `YYYY-MM-DD` is left out rather than passed on: the value
 * is written by hand, and the calendar has no way to read what the extractor
 * could not.
 */
export function occurrencesMissingFrom(task: Task, replaced: ReplacedOccurrences): string[] {
    const missing = new Set<string>((task.excluded_dates ?? []).filter((date) => ISO_DATE_RE.test(date)));
    const seriesId = task.properties?.ID;
    if (seriesId) {
        for (const date of replaced.get(seriesId) ?? []) {
            missing.add(date);
        }
    }
    return [...missing].sort();
}
