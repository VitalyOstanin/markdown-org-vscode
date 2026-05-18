import * as path from 'path';
import { AgendaData, DayAgenda, FileTag, Task } from '../types';

function isPositivePattern(pattern: string): boolean {
    return pattern.length > 0 && !pattern.startsWith('!');
}

function isDayAgendaArray(value: AgendaData): value is DayAgenda[] {
    return value.length > 0 && 'date' in value[0];
}

/**
 * Filter agenda tasks by configured file tag.
 *
 * Pattern semantics (matched against `path.basename(task.file)`):
 *   ''             show everything (tag disables filtering)
 *   'foo'          basename contains "foo"
 *   '!...'         basename does not match any positive pattern in fileTags
 *                  (the text after '!' is ignored — it's only a marker)
 *
 * Unknown `tag` (not present in `fileTags`) is treated as "no filter" and
 * the data is returned unchanged.
 */
export function filterTasksByTag(data: AgendaData, tag: string, fileTags: FileTag[]): AgendaData {
    const tagConfig = fileTags.find((t) => t.name === tag);
    if (!tagConfig) {
        return data;
    }

    const pattern = tagConfig.pattern;
    const isNegation = pattern.startsWith('!');
    // Collect positives once instead of re-scanning fileTags inside the hot
    // loop. With N tasks and M tags the negation branch used to be O(N*M);
    // it is now O(M + N*P) where P is the number of *positive* patterns
    // (typically much smaller than M because '!' negations are also entries
    // in fileTags).
    const positives = isNegation ? fileTags.filter((t) => isPositivePattern(t.pattern)).map((t) => t.pattern) : [];

    const filterFn = (task: Task) => {
        if (pattern === '') {
            return true;
        }
        const basename = path.basename(task.file);
        if (isNegation) {
            return !positives.some((p) => basename.includes(p));
        }
        return basename.includes(pattern);
    };

    if (isDayAgendaArray(data)) {
        // `markdown-org-extract` omits empty buckets in some agenda modes
        // (week/month), so a DayAgenda may arrive without all four arrays
        // populated. Default each bucket to `[]` before filtering so the
        // shape stays consistent and `.filter` never lands on `undefined`.
        return data.map((day) => ({
            ...day,
            overdue: (day.overdue ?? []).filter(filterFn),
            scheduled_timed: (day.scheduled_timed ?? []).filter(filterFn),
            scheduled_no_time: (day.scheduled_no_time ?? []).filter(filterFn),
            upcoming: (day.upcoming ?? []).filter(filterFn)
        }));
    }
    return (data as Task[]).filter(filterFn);
}
