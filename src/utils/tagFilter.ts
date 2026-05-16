import * as path from 'path';
import { AgendaData, DayAgenda, FileTag, Task } from '../types';

function isPositivePattern(pattern: string): boolean {
    return pattern.length > 0 && !pattern.startsWith('!');
}

function matchesAnyPositive(basename: string, fileTags: FileTag[]): boolean {
    return fileTags.some((t) => isPositivePattern(t.pattern) && basename.includes(t.pattern));
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

    const filterFn = (task: Task) => {
        if (pattern === '') {
            return true;
        }
        const basename = path.basename(task.file);
        if (pattern.startsWith('!')) {
            return !matchesAnyPositive(basename, fileTags);
        }
        return basename.includes(pattern);
    };

    if (isDayAgendaArray(data)) {
        return data.map((day) => ({
            ...day,
            overdue: day.overdue.filter(filterFn),
            scheduled_timed: day.scheduled_timed.filter(filterFn),
            scheduled_no_time: day.scheduled_no_time.filter(filterFn),
            upcoming: day.upcoming.filter(filterFn)
        }));
    }
    return (data as Task[]).filter(filterFn);
}
