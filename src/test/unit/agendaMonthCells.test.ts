import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildMonthDayIndex, buildMonthGrid } from '../../utils/agendaMonthCells';
import type { DayAgenda, TaskWithOffset } from '../../types';

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
    test('only the rows dated to the day are counted', () => {
        // The extractor repeats a missed task under today, as arrears in
        // `overdue` and as an approaching deadline in `upcoming`. Counting
        // those buckets would count the same task twice -- once in its own
        // cell, once in today's -- and today's number would follow the anchor
        // around as the reader pages through months.
        const index = buildMonthDayIndex(
            [
                day('2025-12-09', {
                    overdue: [task(), task()],
                    scheduled_timed: [task()],
                    scheduled_no_time: [task()],
                    upcoming: [task()]
                })
            ],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-09': { total: 2, overdue: false } });
    });

    test('a date gone by with planning still on it is marked overdue', () => {
        const index = buildMonthDayIndex(
            [day('2025-12-02', { scheduled_no_time: [task({ timestamp_type: 'SCHEDULED' })] })],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-02': { total: 1, overdue: true } });
    });

    test('a date gone by holding a plain timestamp owes nothing', () => {
        // `keeps_a_missed_date` in the extractor: only SCHEDULED and DEADLINE
        // leave a debt behind. A meeting that has been and gone does not.
        const index = buildMonthDayIndex(
            [day('2025-12-02', { scheduled_timed: [task({ timestamp_type: 'TIMESTAMP' })] })],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-02': { total: 1, overdue: false } });
    });

    test('today and the days after it are never overdue', () => {
        const index = buildMonthDayIndex(
            [
                day('2025-12-09', { scheduled_no_time: [task({ timestamp_type: 'DEADLINE' })] }),
                day('2025-12-20', { scheduled_no_time: [task({ timestamp_type: 'DEADLINE' })] })
            ],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, {
            '2025-12-09': { total: 1, overdue: false },
            '2025-12-20': { total: 1, overdue: false }
        });
    });

    test('days without dated rows are omitted, so a missing key means an empty day', () => {
        const index = buildMonthDayIndex(
            [day('2025-12-01'), day('2025-12-15', { scheduled_timed: [task()] })],
            '2025-12-09'
        );
        assert.deepStrictEqual(Object.keys(index), ['2025-12-15']);
    });

    test('a day carrying only repeats of other days gets no chip', () => {
        const index = buildMonthDayIndex([day('2025-12-09', { overdue: [task()], upcoming: [task()] })], '2025-12-09');
        assert.deepStrictEqual(index, {});
    });

    test('sparse payloads that omit whole buckets are counted, not crashed on', () => {
        // What markdown-org-extract emits for a month: absent buckets instead
        // of empty arrays (the v0.3.0 "Cannot read properties of undefined"
        // regression came from exactly this shape).
        const sparse = [{ date: '2025-12-15', scheduled_no_time: [task()] }] as unknown as DayAgenda[];
        assert.deepStrictEqual(buildMonthDayIndex(sparse, '2025-12-09'), {
            '2025-12-15': { total: 1, overdue: false }
        });
    });

    test('entries without a date are skipped', () => {
        const broken = [
            { scheduled_timed: [task()] },
            day('2025-12-02', { scheduled_timed: [task({ timestamp_type: 'SCHEDULED' })] })
        ] as unknown as DayAgenda[];
        assert.deepStrictEqual(buildMonthDayIndex(broken, '2025-12-09'), {
            '2025-12-02': { total: 1, overdue: true }
        });
    });

    test('an empty or missing payload yields an empty index', () => {
        assert.deepStrictEqual(buildMonthDayIndex([], '2025-12-09'), {});
        assert.deepStrictEqual(buildMonthDayIndex(undefined as unknown as DayAgenda[], '2025-12-09'), {});
    });
});

// The grid the calendar lays its cells on. December 2025 starts on a Monday
// and has 31 days, which makes the two week-start variants easy to tell apart:
// Monday-first needs no leading padding, Sunday-first needs one day.
suite('buildMonthGrid', () => {
    test('a Monday-first December 2025 starts on the 1st with no padding', () => {
        const cells = buildMonthGrid('2025-12-15', 1, '2025-12-15');
        assert.strictEqual(cells[0]?.date, '2025-12-01');
        assert.strictEqual(cells[0].otherMonth, false);
    });

    test('a Sunday-first week pads with the last day of November', () => {
        const cells = buildMonthGrid('2025-12-15', 0, '2025-12-15');
        assert.strictEqual(cells[0]?.date, '2025-11-30');
        assert.strictEqual(cells[0].otherMonth, true);
        assert.strictEqual(cells[0].dayNumber, 30, 'a padding cell prints its own month day number');
    });

    test('the cell count is always a whole number of weeks', () => {
        for (const anchor of ['2026-02-15', '2026-03-15', '2026-05-15', '2027-08-15']) {
            for (const firstOffset of [0, 1]) {
                const cells = buildMonthGrid(anchor, firstOffset, '2026-01-01');
                assert.strictEqual(cells.length % 7, 0, `${anchor} offset ${firstOffset} gave ${cells.length} cells`);
            }
        }
    });

    test('every date of the anchor month appears exactly once, in order', () => {
        const own = buildMonthGrid('2026-02-10', 1, '2026-01-01').filter((c) => !c.otherMonth);
        assert.strictEqual(own.length, 28, 'February 2026 has 28 days');
        assert.strictEqual(own[0]?.date, '2026-02-01');
        assert.strictEqual(own.at(-1)?.date, '2026-02-28');
    });

    test('a leap February keeps the 29th', () => {
        const own = buildMonthGrid('2028-02-01', 1, '2028-01-01').filter((c) => !c.otherMonth);
        assert.strictEqual(own.length, 29);
        assert.strictEqual(own.at(-1)?.date, '2028-02-29');
    });

    test('padding crosses the year boundary in both directions', () => {
        assert.strictEqual(buildMonthGrid('2026-01-15', 1, '2026-01-01')[0]?.date, '2025-12-29');
        assert.strictEqual(buildMonthGrid('2026-12-15', 1, '2026-01-01').at(-1)?.date, '2027-01-03');
    });

    test('weekends are marked by weekday, whichever day the week starts on', () => {
        for (const firstOffset of [0, 1]) {
            const cells = buildMonthGrid('2025-12-15', firstOffset, '2025-12-15');
            const weekend = new Set(cells.filter((c) => c.weekend).map((c) => c.date));
            assert.ok(weekend.has('2025-12-06'), 'Saturday 6 Dec is a weekend');
            assert.ok(weekend.has('2025-12-07'), 'Sunday 7 Dec is a weekend');
            assert.ok(!weekend.has('2025-12-08'), 'Monday 8 Dec is not');
        }
    });

    test('exactly one cell is today, and only when today is on the grid', () => {
        const withToday = buildMonthGrid('2025-12-15', 1, '2025-12-09').filter((c) => c.today);
        assert.deepStrictEqual(
            withToday.map((c) => c.date),
            ['2025-12-09']
        );
        assert.strictEqual(buildMonthGrid('2025-12-15', 1, '2026-06-01').filter((c) => c.today).length, 0);
    });

    test('today is marked on a padding cell too -- it is still that date', () => {
        const marked = buildMonthGrid('2026-01-15', 1, '2025-12-31').filter((c) => c.today);
        assert.deepStrictEqual(
            marked.map((c) => [c.date, c.otherMonth]),
            [['2025-12-31', true]]
        );
    });
});
