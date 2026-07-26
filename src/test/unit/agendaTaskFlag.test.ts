import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { resolveTaskFlag } from '../../utils/agendaTaskFlag';
import { isCancelled } from '../../utils/normalizeTaskType';
import { Task } from '../../types';

function task(over: Partial<Task>): Task {
    return { heading: 'h', file: 'f', line: 1, ...over } as Task;
}

// Bind the shared cancelled check the way the webview does (it passes its own
// inlined isCancelled), so tests exercise the real precedence.
function flag(t: Task) {
    return resolveTaskFlag(t, isCancelled);
}

suite('resolveTaskFlag', () => {
    test('cancelled wins over everything', () => {
        assert.strictEqual(
            flag(
                task({
                    task_type: 'CANCELLED',
                    timestamp_type: 'DEADLINE',
                    timestamp_time: '10:00',
                    timestamp_repeater: '+1d'
                })
            ),
            'cancelled'
        );
    });
    test('deadline beats repeat and time', () => {
        assert.strictEqual(
            flag(
                task({
                    task_type: 'TODO',
                    timestamp_type: 'DEADLINE',
                    timestamp_time: '10:00',
                    timestamp_repeater: '+1d'
                })
            ),
            'deadline'
        );
    });
    test('repeat beats plain scheduled time', () => {
        assert.strictEqual(
            flag(
                task({
                    task_type: 'TODO',
                    timestamp_type: 'SCHEDULED',
                    timestamp_time: '10:00',
                    timestamp_repeater: '+1d'
                })
            ),
            'repeat'
        );
    });
    test('scheduled with time', () => {
        assert.strictEqual(
            flag(task({ task_type: 'TODO', timestamp_type: 'SCHEDULED', timestamp_time: '10:00' })),
            'scheduled'
        );
    });
    test('plain TODO with date has no flag', () => {
        assert.strictEqual(flag(task({ task_type: 'TODO', timestamp_type: 'SCHEDULED' })), '');
    });
    test('done without special type has no flag', () => {
        assert.strictEqual(flag(task({ task_type: 'DONE' })), '');
    });
    test('empty task has no flag', () => {
        assert.strictEqual(flag(task({})), '');
    });
});
