import * as assert from 'assert';
import { suite, test } from 'mocha';
import { resolveAttentionLevel } from '../../utils/agendaAttention';
import { isCancelled } from '../../utils/normalizeTaskType';
import { Task } from '../../types';

function task(over: Partial<Task>): Task {
    return { heading: 'h', file: 'f', line: 1, ...over } as Task;
}

// Bind the shared cancelled check the way the webview does (it passes its own
// inlined isCancelled), so tests exercise the real precedence.
function level(t: Task, daysOffset?: number, taskType?: string) {
    return resolveAttentionLevel(t, daysOffset, taskType, isCancelled);
}

suite('resolveAttentionLevel', () => {
    test('done wins over everything, even a DEADLINE', () => {
        assert.strictEqual(level(task({ task_type: 'DONE', timestamp_type: 'DEADLINE' }), -3, 'overdue'), 'done');
    });
    test('cancelled wins over a DEADLINE', () => {
        assert.strictEqual(level(task({ task_type: 'CANCELLED', timestamp_type: 'DEADLINE' }), -3), 'cancelled');
    });
    test('DEADLINE is danger even in the future', () => {
        assert.strictEqual(level(task({ task_type: 'TODO', timestamp_type: 'DEADLINE' }), 5, 'upcoming'), 'danger');
    });
    test('overdue bucket is danger', () => {
        assert.strictEqual(
            level(task({ task_type: 'TODO', timestamp_type: 'SCHEDULED' }), undefined, 'overdue'),
            'danger'
        );
    });
    test('negative days_offset is danger even without the overdue bucket', () => {
        assert.strictEqual(level(task({ task_type: 'TODO', timestamp_type: 'SCHEDULED' }), -1), 'danger');
    });
    test('today (offset 0) is normal', () => {
        assert.strictEqual(
            level(task({ task_type: 'TODO', timestamp_type: 'SCHEDULED', timestamp_time: '15:00' }), 0),
            'normal'
        );
    });
    test('future (positive offset) is normal', () => {
        assert.strictEqual(level(task({ task_type: 'TODO', timestamp_type: 'SCHEDULED' }), 3, 'upcoming'), 'normal');
    });
    test('keyword-less task with a future date is normal', () => {
        assert.strictEqual(level(task({ timestamp_type: 'SCHEDULED' }), 2), 'normal');
    });
    test('keyword-less overdue task is danger', () => {
        assert.strictEqual(level(task({ timestamp_type: 'SCHEDULED' }), -5), 'danger');
    });
});
