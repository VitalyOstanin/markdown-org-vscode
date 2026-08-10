import * as path from 'node:path';
import type { AgendaData, DayAgenda, Task } from '../types';
import type { MergedTag } from './tagDictionary';
import { fileMatchesTag } from './tagDictionary';

// Empty arrays return `false` here even though `DayAgenda[]` and `Task[]` are
// both valid empty shapes. That is deliberate: the caller's two branches both
// reduce to "no tasks" on an empty input (`Task[].filter` and `DayAgenda[].map`
// over zero elements alike yield `[]`), so falling through to the simpler
// `Task[]` branch is harmless and avoids guessing at a shape with no
// discriminating element to inspect.
function isDayAgendaArray(value: AgendaData): value is DayAgenda[] {
    const first = value[0];
    return first !== undefined && 'date' in first;
}

/**
 * Filter agenda tasks by the selected tag of the merged dictionary.
 *
 * The dictionary spans every directory of the agenda plus the settings, so a
 * tag selects the same notes wherever they came from -- see `tagDictionary` for
 * how the patterns of one name are merged and what a negation is measured
 * against.
 *
 * A tag name the dictionary does not hold is treated as "no filter" and the
 * data is returned unchanged: a `currentTag` left over from an edited
 * configuration must not empty the agenda.
 */
export function filterTasksByTag(data: AgendaData, tag: string, dictionary: readonly MergedTag[]): AgendaData {
    const selected = dictionary.find((t) => t.name === tag);
    if (!selected) {
        return data;
    }

    const filterFn = (task: Task) => fileMatchesTag(path.basename(task.file), selected, dictionary);

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
    return data.filter(filterFn);
}
