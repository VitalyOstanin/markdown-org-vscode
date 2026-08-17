import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildMonthDayIndex, buildMonthGrid } from '../../utils/agendaMonthCells';
import type { DayAgenda, TaskWithOffset } from '../../types';
import { monthGridDays } from './_monthGridDays';

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
        assert.deepStrictEqual(index, { '2025-12-09': { total: 2, overdue: false, dueSoon: false } });
    });

    test('a date gone by with planning still on it is marked overdue', () => {
        const index = buildMonthDayIndex(
            [day('2025-12-02', { scheduled_no_time: [task({ timestamp_type: 'SCHEDULED' })] })],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-02': { total: 1, overdue: true, dueSoon: false } });
    });

    test('a date gone by holding a plain timestamp owes nothing', () => {
        // `keeps_a_missed_date` in the extractor: only SCHEDULED and DEADLINE
        // leave a debt behind. A meeting that has been and gone does not.
        const index = buildMonthDayIndex(
            [day('2025-12-02', { scheduled_timed: [task({ timestamp_type: 'TIMESTAMP' })] })],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-02': { total: 1, overdue: false, dueSoon: false } });
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
            '2025-12-09': { total: 1, overdue: false, dueSoon: false },
            '2025-12-20': { total: 1, overdue: false, dueSoon: false }
        });
    });

    test('a deadline the extractor is already warning about marks its own date', () => {
        // The copy under today is what says the warning window has opened --
        // the extractor applies `org-deadline-warning-days` and the `-Xd` a
        // timestamp may carry, and the client has neither number. The mark
        // goes on the date the deadline falls on, matched by file and line.
        const deadline = task({ file: '/w/a.md', line: 12, timestamp_type: 'DEADLINE' });
        const index = buildMonthDayIndex(
            [
                day('2025-12-09', { upcoming: [{ ...deadline, days_offset: 11 }] }),
                day('2025-12-20', { scheduled_no_time: [deadline] })
            ],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-20': { total: 1, overdue: false, dueSoon: true } });
    });

    test('a deadline too far out for the warning to have opened is not marked', () => {
        const index = buildMonthDayIndex(
            [
                day('2025-12-09'),
                day('2025-12-31', { scheduled_no_time: [task({ line: 12, timestamp_type: 'DEADLINE' })] })
            ],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-31': { total: 1, overdue: false, dueSoon: false } });
    });

    test('a date gone by is marked overdue and not due, whatever today carries', () => {
        const deadline = task({ line: 12, timestamp_type: 'DEADLINE' });
        const index = buildMonthDayIndex(
            [
                day('2025-12-02', { scheduled_no_time: [deadline] }),
                day('2025-12-09', { upcoming: [{ ...deadline, days_offset: -7 }] })
            ],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-02': { total: 1, overdue: true, dueSoon: false } });
    });

    test('a scheduled date in today’s upcoming does not mark anything', () => {
        // Only a deadline opens a warning window; `upcoming` also carries the
        // repeats of tasks scheduled ahead, which are simply future work.
        const ahead = task({ line: 12, timestamp_type: 'SCHEDULED' });
        const index = buildMonthDayIndex(
            [day('2025-12-09', { upcoming: [ahead] }), day('2025-12-11', { scheduled_no_time: [ahead] })],
            '2025-12-09'
        );
        assert.deepStrictEqual(index, { '2025-12-11': { total: 1, overdue: false, dueSoon: false } });
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
            '2025-12-15': { total: 1, overdue: false, dueSoon: false }
        });
    });

    test('entries without a date are skipped', () => {
        const broken = [
            { scheduled_timed: [task()] },
            day('2025-12-02', { scheduled_timed: [task({ timestamp_type: 'SCHEDULED' })] })
        ] as unknown as DayAgenda[];
        assert.deepStrictEqual(buildMonthDayIndex(broken, '2025-12-09'), {
            '2025-12-02': { total: 1, overdue: true, dueSoon: false }
        });
    });

    test('an empty or missing payload yields an empty index', () => {
        assert.deepStrictEqual(buildMonthDayIndex([], '2025-12-09'), {});
        assert.deepStrictEqual(buildMonthDayIndex(undefined as unknown as DayAgenda[], '2025-12-09'), {});
    });
});

// The grid the calendar lays its cells on. Its dates now come from the
// extractor's `--agenda month-grid`, which answers with whole weeks beginning
// on the day `--week-start` names; the layout only reads them back. December
// 2025 starts on a Monday, so a Monday-first grid needs no leading padding and
// a Sunday-first one pads with 30 November.
suite('buildMonthGrid', () => {
    test('the cells are the payload days, in the order they arrived', () => {
        const cells = buildMonthGrid(monthGridDays('2025-12-01', 35), '2025-12-15', '2025-12-15');
        assert.strictEqual(cells.length, 35);
        assert.strictEqual(cells[0]?.date, '2025-12-01');
        assert.strictEqual(cells[0].otherMonth, false);
        assert.strictEqual(cells.at(-1)?.date, '2026-01-04');
    });

    test('a day outside the anchor month is padding, and prints its own number', () => {
        const cells = buildMonthGrid(monthGridDays('2025-11-30', 42), '2025-12-15', '2025-12-15');
        assert.strictEqual(cells[0]?.date, '2025-11-30');
        assert.strictEqual(cells[0].otherMonth, true);
        assert.strictEqual(cells[0].dayNumber, 30, 'a padding cell prints its own month day number');
        const own = cells.filter((c) => !c.otherMonth);
        assert.strictEqual(own.length, 31, 'December 2025 has 31 days');
        assert.strictEqual(own[0]?.date, '2025-12-01');
        assert.strictEqual(own.at(-1)?.date, '2025-12-31');
    });

    test('padding is read off the anchor across a year boundary', () => {
        const cells = buildMonthGrid(monthGridDays('2025-12-29', 35), '2026-01-15', '2026-01-01');
        assert.strictEqual(cells[0]?.otherMonth, true, '29 December pads January');
        assert.strictEqual(cells[3]?.date, '2026-01-01');
        assert.strictEqual(cells[3].otherMonth, false);
    });

    test('weekends are marked by weekday, whichever day the week starts on', () => {
        for (const first of ['2025-12-01', '2025-11-30']) {
            const cells = buildMonthGrid(monthGridDays(first, 35), '2025-12-15', '2025-12-15');
            const weekend = new Set(cells.filter((c) => c.weekend).map((c) => c.date));
            assert.ok(weekend.has('2025-12-06'), 'Saturday 6 Dec is a weekend');
            assert.ok(weekend.has('2025-12-07'), 'Sunday 7 Dec is a weekend');
            assert.ok(!weekend.has('2025-12-08'), 'Monday 8 Dec is not');
        }
    });

    test('exactly one cell is today, and only when today is on the grid', () => {
        const days = monthGridDays('2025-12-01', 35);
        const withToday = buildMonthGrid(days, '2025-12-15', '2025-12-09').filter((c) => c.today);
        assert.deepStrictEqual(
            withToday.map((c) => c.date),
            ['2025-12-09']
        );
        assert.strictEqual(buildMonthGrid(days, '2025-12-15', '2026-06-01').filter((c) => c.today).length, 0);
    });

    test('today is marked on a padding cell too -- it is still that date', () => {
        const marked = buildMonthGrid(monthGridDays('2025-12-29', 35), '2026-01-15', '2025-12-31').filter(
            (c) => c.today
        );
        assert.deepStrictEqual(
            marked.map((c) => [c.date, c.otherMonth]),
            [['2025-12-31', true]]
        );
    });

    test('a payload with no days lays out no cells', () => {
        assert.deepStrictEqual(buildMonthGrid([], '2025-12-15', '2025-12-15'), []);
        assert.deepStrictEqual(buildMonthGrid(undefined as unknown as DayAgenda[], '2025-12-15', '2025-12-15'), []);
    });

    test('a day with no date is skipped rather than laid out as a blank cell', () => {
        const days = [day('2025-12-01'), { ...day('2025-12-02'), date: '' }, day('2025-12-03')];
        assert.deepStrictEqual(
            buildMonthGrid(days, '2025-12-15', '2025-12-15').map((c) => c.date),
            ['2025-12-01', '2025-12-03']
        );
    });
});
