import * as assert from 'assert';
import { normalizeAgendaTaskTypes, normalizeTaskType } from '../../utils/normalizeTaskType';
import type { DayAgenda, Task } from '../../types';

suite('normalizeTaskType', () => {
    test('returns TODO/DONE/CANCELLED unchanged', () => {
        assert.strictEqual(normalizeTaskType('TODO'), 'TODO');
        assert.strictEqual(normalizeTaskType('DONE'), 'DONE');
        assert.strictEqual(normalizeTaskType('CANCELLED'), 'CANCELLED');
    });
    test('returns undefined for unknown values', () => {
        assert.strictEqual(normalizeTaskType('MAYBE'), undefined);
        assert.strictEqual(normalizeTaskType('cancelled'), undefined);
        assert.strictEqual(normalizeTaskType(''), undefined);
        assert.strictEqual(normalizeTaskType(undefined), undefined);
        assert.strictEqual(normalizeTaskType(null as unknown as string), undefined);
        assert.strictEqual(normalizeTaskType(42 as unknown as string), undefined);
    });
});

suite('normalizeAgendaTaskTypes', () => {
    const task = (overrides: Partial<Task>): Task => ({
        file: 'f.md',
        line: 1,
        heading: 'H',
        content: '',
        ...overrides
    });

    test('normalizes a flat Task[] list, degrading unknown keywords to undefined', () => {
        const input = [
            task({ task_type: 'TODO' as Task['task_type'] }),
            task({ task_type: 'CANCELLED' as Task['task_type'] }),
            task({ task_type: 'MAYBE' as unknown as Task['task_type'] })
        ];
        const out = normalizeAgendaTaskTypes(input) as Task[];
        assert.strictEqual(out[0].task_type, 'TODO');
        assert.strictEqual(out[1].task_type, 'CANCELLED');
        assert.strictEqual(out[2].task_type, undefined);
    });

    test('does not mutate the input tasks', () => {
        const t = task({ task_type: 'MAYBE' as unknown as Task['task_type'] });
        normalizeAgendaTaskTypes([t]);
        assert.strictEqual(t.task_type as unknown as string, 'MAYBE');
    });

    test('normalizes nested DayAgenda[] buckets', () => {
        const day: DayAgenda = {
            date: '2026-05-29',
            overdue: [task({ task_type: 'WAITING' as unknown as Task['task_type'] })],
            scheduled_timed: [task({ task_type: 'CANCELLED' as Task['task_type'] })],
            scheduled_no_time: [],
            upcoming: [task({ task_type: 'DONE' as Task['task_type'] })]
        };
        const out = normalizeAgendaTaskTypes([day]) as DayAgenda[];
        assert.strictEqual(out[0].overdue[0].task_type, undefined);
        assert.strictEqual(out[0].scheduled_timed[0].task_type, 'CANCELLED');
        assert.strictEqual(out[0].upcoming[0].task_type, 'DONE');
    });

    test('tolerates DayAgenda buckets omitted by the extractor', () => {
        const day = { date: '2026-05-29' } as unknown as DayAgenda;
        const out = normalizeAgendaTaskTypes([day]) as DayAgenda[];
        assert.deepStrictEqual(out[0].overdue, []);
        assert.deepStrictEqual(out[0].upcoming, []);
    });

    test('returns empty input unchanged', () => {
        assert.deepStrictEqual(normalizeAgendaTaskTypes([]), []);
    });
});
