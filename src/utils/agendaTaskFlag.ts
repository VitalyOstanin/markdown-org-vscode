import { Task } from '../types';
import { isCancelled } from './normalizeTaskType';

export type TaskFlag = 'cancelled' | 'deadline' | 'repeat' | 'scheduled' | '';

/**
 * Ledger-style type flag for a task, first match wins:
 *   cancelled (⊘) > deadline (⚑) > repeat (↻) > scheduled-with-time (◷) > none.
 * Inlined into the agenda webview via `.toString()`; keep it dependency-light
 * (only `isCancelled`, which is inlined alongside).
 */
export function resolveTaskFlag(task: Task): TaskFlag {
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
