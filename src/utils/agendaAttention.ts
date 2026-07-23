import { Task } from '../types';

export type AttentionLevel = 'done' | 'cancelled' | 'danger' | 'normal';

/**
 * Table-style attention level driving the status-dot colour, first match wins:
 *   done (green) > cancelled (grey) > danger (red) > normal (blue).
 *
 * danger = a task that needs action now: a DEADLINE, or anything overdue.
 * "Overdue" is signalled by the extractor's `overdue` bucket (taskType) or by
 * a negative `days_offset` relative to today. Everything else still open
 * (today or in the future) is `normal`.
 *
 * Inlined into the agenda webview via `.toString()`, so the body must not
 * reference any module-level import (TypeScript rewrites such a reference to
 * `<module>_1.name`, undefined in the webview). `isCancelled` is passed as a
 * parameter -- the same convention `resolveTaskFlag`/`buildTimeInfo` use.
 */
export function resolveAttentionLevel(
    task: Task,
    daysOffset: number | undefined,
    taskType: string | undefined,
    isCancelled: (status: string | undefined) => boolean
): AttentionLevel {
    if (task.task_type === 'DONE') {
        return 'done';
    }
    if (isCancelled(task.task_type)) {
        return 'cancelled';
    }
    const overdue = taskType === 'overdue' || (typeof daysOffset === 'number' && daysOffset < 0);
    if (task.timestamp_type === 'DEADLINE' || overdue) {
        return 'danger';
    }
    return 'normal';
}
