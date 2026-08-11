/**
 * Turning a band of the day card back into the tasks it is made of.
 *
 * The page posts the band's key; the tasks are resolved here, on the side that
 * holds the payload the view was built from. Two reasons it is done this way
 * rather than by sending the rows: a message carrying a file list is a message
 * that can name a file the agenda never showed, and the grouping rule already
 * lives in `buildDaySections` -- running it again over the same payload gives
 * exactly the band on screen, with no second definition to keep in step.
 */
import type { AgendaData, DayAgenda, Task, TaskWithOffset } from '../types';
import { hideCollections } from './agendaCollectionFilter';
import { buildDaySections } from './agendaDaySummary';
import type { DaySectionLabels } from './agendaDaySummary';
import type { BulkAction, BulkTarget } from './bulkGroupEdit';

const ACTIONS: BulkAction[] = ['move-to-today', 'drop-planning', 'cancel'];

/** The action a `groupAction` message named, or undefined for anything else. */
export function asBulkAction(value: string | undefined): BulkAction | undefined {
    return ACTIONS.find((action) => action === value);
}

/**
 * The tasks of one day-card section, as targets for a group edit.
 *
 * A payload that is not a day agenda (the tasks view sends a flat list) and a
 * key no section carries both yield nothing: the menu is only rendered on the
 * day card's overdue bands, so anything else is a message that should not have
 * arrived.
 *
 * `hidden` names the roots whose chips are off. The state lives in the page, so
 * it travels with the message: the band is rebuilt from the payload the view was
 * built from, and that payload is the whole scan. Without narrowing it first,
 * the edit would reach rows of a directory the reader had switched off -- files
 * that were never on the screen the menu was opened from.
 */
export function groupTargets(
    data: AgendaData,
    sectionKey: string,
    labels: DaySectionLabels,
    hidden: readonly string[] = []
): BulkTarget[] {
    const day = firstDay(hideCollections(data, hidden));
    if (!day) {
        return [];
    }
    const section = buildDaySections(day, labels).find((candidate) => candidate.key === sectionKey);
    if (!section) {
        return [];
    }
    return section.items
        .map((item) => item.task)
        .filter((task) => typeof task.file === 'string' && task.file !== '' && typeof task.line === 'number')
        .map((task): BulkTarget => ({
            file: task.file,
            line: task.line,
            heading: task.heading,
            keyword: planningKeyword(task)
        }));
}

/**
 * Which planning line put the row where it is, when the extractor named one.
 *
 * It travels with the target so a task with both a SCHEDULED and a DEADLINE has
 * only the date it was listed under moved: a deadline is not rescheduled by
 * answering the schedule that slipped.
 */
function planningKeyword(task: TaskWithOffset): 'SCHEDULED' | 'DEADLINE' | undefined {
    if (task.timestamp_type === 'SCHEDULED' || task.timestamp_type === 'DEADLINE') {
        return task.timestamp_type;
    }
    return undefined;
}

function firstDay(data: AgendaData): DayAgenda | undefined {
    const first: DayAgenda | Task | undefined = Array.isArray(data) ? data[0] : undefined;
    if (!first || 'file' in first) {
        // A day agenda carries a `date`; a task carries a `file`. The two
        // shapes share the wire, and the tasks view sends the second.
        return undefined;
    }
    return typeof first.date === 'string' ? first : undefined;
}
