import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { taskDateDirection } from '../../utils/agendaDateDirection';
import type { Task } from '../../types';

function task(timestamp_date?: string): Task {
    return {
        file: '/w/notes.md',
        line: 1,
        heading: 'Write the report',
        content: '',
        task_type: 'TODO',
        timestamp_type: 'SCHEDULED',
        ...(timestamp_date === undefined ? {} : { timestamp_date })
    };
}

suite('agendaDateDirection.taskDateDirection', () => {
    test('a date before the anchor points back, one after it points forward', () => {
        assert.strictEqual(taskDateDirection(task('2025-12-08'), '2025-12-09'), 'overdue');
        assert.strictEqual(taskDateDirection(task('2025-12-10'), '2025-12-09'), 'upcoming');
    });

    test('the anchor day itself points neither way', () => {
        assert.strictEqual(taskDateDirection(task('2025-12-09'), '2025-12-09'), 'today');
    });

    test('a task with no date has no direction, so its column stays empty', () => {
        assert.strictEqual(taskDateDirection(task(), '2025-12-09'), undefined);
        assert.strictEqual(taskDateDirection(task(''), '2025-12-09'), undefined);
    });

    test('the comparison is by date, not by month or year alone', () => {
        // Text order on ISO dates is date order; a naive comparison of the day
        // number would put 2026-01-02 before 2025-12-09.
        assert.strictEqual(taskDateDirection(task('2026-01-02'), '2025-12-09'), 'upcoming');
        assert.strictEqual(taskDateDirection(task('2025-11-30'), '2025-12-01'), 'overdue');
    });
});
