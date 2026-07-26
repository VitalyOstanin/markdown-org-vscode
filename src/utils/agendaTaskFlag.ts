import type { Task } from '../types';

export type TaskFlag = 'cancelled' | 'deadline' | 'repeat' | 'scheduled' | '';

/**
 * Table-style type flag for a task, first match wins:
 *   cancelled (⊘) > deadline (⚑) > repeat (↻) > scheduled-with-time (◷) > none.
 *
 * This function is inlined into the agenda webview via `.toString()`, so its
 * body must not reference any module-level import (TypeScript rewrites such a
 * reference to `<module>_1.name`, which is undefined inside the webview and
 * throws). The cancelled check is therefore injected as the `isCancelled`
 * parameter -- the same convention `buildTimeInfo` uses for `escapeHtml`. The
 * webview passes its own inlined `isCancelled`; callers elsewhere pass the
 * shared helper from `./normalizeTaskType`.
 */
export function resolveTaskFlag(task: Task, isCancelled: (status: string | undefined) => boolean): TaskFlag {
    if (isCancelled(task.task_type)) {
        return 'cancelled';
    }
    if (task.timestamp_type === 'DEADLINE') {
        return 'deadline';
    }
    if (task.timestamp_repeater) {
        return 'repeat';
    }
    if (task.timestamp_time) {
        return 'scheduled';
    }
    return '';
}
