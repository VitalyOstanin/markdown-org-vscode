import * as assert from 'assert';
import { suite, test } from 'mocha';
import { buildMonthDayIndex } from '../../utils/agendaMonthCells';
import { DayAgenda, TaskWithOffset } from '../../types';

// The month calendar renders these counts as per-day chips. The webview
// embeds buildMonthDayIndex via `.toString()`, so these tests transitively
// cover the rendered chips.
function task(overrides: Partial<TaskWithOffset> = {}): TaskWithOffset {
    return {
        file: '/w/notes.md',
        line: 1,
        heading: 'Task',
        content: '',
        task_type: 'TODO',
        ...overrides
    };
}

function day(date: string, overrides: Partial<DayAgenda> = {}): DayAgenda {
    return {
        date,
        overdue: [],
        scheduled_timed: [],
        scheduled_no_time: [],
        upcoming: [],
        ...overrides
    };
}

suite('buildMonthDayIndex', () => {
    test('sums every bucket into total and keeps overdue separate', () => {
        const index = buildMonthDayIndex([
            day('2025-12-09', {
                overdue: [task(), task()],
                scheduled_timed: [task()],
                scheduled_no_time: [task()],
                upcoming: [task()]
            })
        ]);
        assert.deepStrictEqual(index, { '2025-12-09': { total: 5, overdue: 2 } });
    });

    test('days without tasks are omitted, so a missing key means an empty day', () => {
        const index = buildMonthDayIndex([day('2025-12-01'), day('2025-12-15', { upcoming: [task()] })]);
        assert.deepStrictEqual(Object.keys(index), ['2025-12-15']);
    });

    test('sparse payloads that omit whole buckets are counted, not crashed on', () => {
        // What markdown-org-extract emits for a month: absent buckets instead
        // of empty arrays (the v0.3.0 "Cannot read properties of undefined"
        // regression came from exactly this shape).
        const sparse = [{ date: '2025-12-15', scheduled_no_time: [task()] }] as unknown as DayAgenda[];
        assert.deepStrictEqual(buildMonthDayIndex(sparse), { '2025-12-15': { total: 1, overdue: 0 } });
    });

    test('entries without a date are skipped', () => {
        const broken = [
            { scheduled_timed: [task()] },
            day('2025-12-02', { overdue: [task()] })
        ] as unknown as DayAgenda[];
        assert.deepStrictEqual(buildMonthDayIndex(broken), { '2025-12-02': { total: 1, overdue: 1 } });
    });

    test('an empty or missing payload yields an empty index', () => {
        assert.deepStrictEqual(buildMonthDayIndex([]), {});
        assert.deepStrictEqual(buildMonthDayIndex(undefined as unknown as DayAgenda[]), {});
    });
});
