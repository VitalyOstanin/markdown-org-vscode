import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    OVERDUE_LONG_AGO_DAYS,
    OVERDUE_RECENT_DAYS,
    buildDaySections,
    buildOverdueBandIndex,
    computeDaySummary
} from '../../utils/agendaDaySummary';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';
import type { DayAgenda, TaskWithOffset } from '../../types';

// Section titles are handed in rather than baked into the helper, so the day
// card speaks the configured UI language (see agendaI18n.ts).
const SECTIONS = AGENDA_STRINGS.en.sections;

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

function day(overrides: Partial<DayAgenda> = {}): DayAgenda {
    return {
        date: '2025-12-09',
        overdue: [],
        scheduled_timed: [],
        scheduled_no_time: [],
        upcoming: [],
        ...overrides
    };
}

suite('computeDaySummary', () => {
    test('counts totals across every bucket', () => {
        const d = day({
            overdue: [task(), task()],
            scheduled_timed: [task()],
            scheduled_no_time: [task()],
            upcoming: [task()]
        });
        assert.deepStrictEqual(computeDaySummary(d), { total: 5, overdue: 2, done: 0 });
    });

    test('done counts DONE tasks from any bucket', () => {
        const d = day({
            scheduled_timed: [task({ task_type: 'DONE' }), task({ task_type: 'TODO' })],
            overdue: [task({ task_type: 'DONE' })]
        });
        assert.deepStrictEqual(computeDaySummary(d), { total: 3, overdue: 1, done: 2 });
    });

    test('empty day yields all-zero counts', () => {
        assert.deepStrictEqual(computeDaySummary(day()), { total: 0, overdue: 0, done: 0 });
    });

    test('tolerates missing buckets (sparse payload)', () => {
        // Week/month payloads may omit empty buckets entirely.
        const sparse = { date: '2025-12-09', scheduled_timed: [task()] } as unknown as DayAgenda;
        assert.deepStrictEqual(computeDaySummary(sparse), { total: 1, overdue: 0, done: 0 });
    });
});

suite('buildDaySections', () => {
    test('orders sections scheduled -> allday -> overdue (overdue last)', () => {
        const d = day({
            overdue: [task({ heading: 'late' })],
            scheduled_timed: [task({ heading: 'timed' })],
            scheduled_no_time: [task({ heading: 'allday' })],
            upcoming: [task({ heading: 'soon' })]
        });
        const sections = buildDaySections(d, SECTIONS);
        assert.deepStrictEqual(
            sections.map((s) => s.key),
            ['scheduled', 'allday', 'overdue-recent']
        );
        assert.ok(sections.at(-1)?.key.startsWith('overdue'), 'overdue must be the last section');
    });

    test('splits the overdue backlog into bands, most actionable first', () => {
        // What a slipped entry asks for differs with its age: a missed repeat
        // is today's work, last week's date wants a nudge, and a date from
        // three years ago wants to be closed. One "Overdue" heading over all
        // of them buries the first under the last.
        const d = day({
            overdue: [
                task({ heading: 'ancient', days_offset: -1947 }),
                task({ heading: 'this spring', days_offset: -152 }),
                task({ heading: 'yesterday', days_offset: -1 }),
                task({ heading: 'missed standup', days_offset: -3, timestamp_repeater: '++7d' })
            ]
        });
        const sections = buildDaySections(d, SECTIONS);
        assert.deepStrictEqual(
            sections.map((s) => [s.key, s.items[0]?.task.heading]),
            [
                ['overdue-repeat', 'missed standup'],
                ['overdue-recent', 'yesterday'],
                ['overdue-earlier', 'this spring'],
                ['overdue-long', 'ancient']
            ]
        );
    });

    test('a repeater outranks the age of the date it missed', () => {
        // Whether the occurrence was missed yesterday or last spring, what to
        // do with it is the same: the next occurrence is the work.
        const d = day({
            overdue: [task({ heading: 'old repeat', days_offset: -400, timestamp_repeater: '+1m' })]
        });
        assert.strictEqual(buildDaySections(d, SECTIONS)[0]?.key, 'overdue-repeat');
    });

    test('a date exactly on a band boundary stays in the nearer band', () => {
        const d = day({
            overdue: [
                task({ heading: 'a week ago', days_offset: -OVERDUE_RECENT_DAYS }),
                task({ heading: 'a year ago', days_offset: -OVERDUE_LONG_AGO_DAYS })
            ]
        });
        assert.deepStrictEqual(
            buildDaySections(d, SECTIONS).map((s) => s.key),
            ['overdue-recent', 'overdue-earlier']
        );
    });

    test('all-day & upcoming merges scheduled_no_time then upcoming, tagged by kind', () => {
        const d = day({
            scheduled_no_time: [task({ heading: 'allday' })],
            upcoming: [task({ heading: 'soon' })]
        });
        const allday = buildDaySections(d, SECTIONS).find((s) => s.key === 'allday');
        assert.ok(allday);
        assert.deepStrictEqual(
            allday.items.map((it) => [it.task.heading, it.kind]),
            [
                ['allday', 'notime'],
                ['soon', 'upcoming']
            ]
        );
    });

    test('overdue items are tagged overdue; timed items tagged timed', () => {
        const d = day({ overdue: [task()], scheduled_timed: [task()] });
        const sections = buildDaySections(d, SECTIONS);
        assert.strictEqual(sections.find((s) => s.key === 'overdue-recent')!.items[0]!.kind, 'overdue');
        assert.strictEqual(sections.find((s) => s.key === 'scheduled')!.items[0]!.kind, 'timed');
    });

    test('drops empty sections entirely', () => {
        const d = day({ scheduled_timed: [task()] });
        const sections = buildDaySections(d, SECTIONS);
        assert.deepStrictEqual(
            sections.map((s) => s.key),
            ['scheduled']
        );
    });

    test('empty day yields no sections', () => {
        assert.deepStrictEqual(buildDaySections(day(), SECTIONS), []);
    });

    test('section titles come from the supplied labels, not from the helper', () => {
        const d = day({ overdue: [task()], scheduled_timed: [task()], scheduled_no_time: [task()] });
        const titles = buildDaySections(d, AGENDA_STRINGS.ru.sections).map((s) => s.title);
        assert.deepStrictEqual(titles, ['Ко времени', 'Весь день и предстоящие', 'Просрочено на этой неделе']);
    });

    test('item count matches the source bucket sizes', () => {
        const d = day({ scheduled_timed: [task(), task(), task()] });
        assert.strictEqual(buildDaySections(d, SECTIONS)[0]!.items.length, 3);
    });
});

// A date gone by breaks down by the rows dated to it, not by the arrears
// bucket: the extractor gathers arrears under today alone, so reading that
// bucket hung the whole month's backlog on whichever cell today was.
suite('buildOverdueBandIndex', () => {
    const TODAY = '2025-12-09';
    const planned = (overrides: Partial<TaskWithOffset> = {}): TaskWithOffset =>
        task({ timestamp_type: 'SCHEDULED', ...overrides });

    test('a date gone by is split by what is left on it, repeats told apart', () => {
        const index = buildOverdueBandIndex(
            [
                day({
                    date: '2025-12-02',
                    scheduled_timed: [planned({ timestamp_repeater: '+1d' })],
                    scheduled_no_time: [planned(), planned()]
                })
            ],
            SECTIONS,
            TODAY
        );
        assert.deepStrictEqual(index['2025-12-02'], [
            { title: SECTIONS.overdueRepeat, count: 1 },
            { title: SECTIONS.overdueRecent, count: 2 }
        ]);
    });

    test('the band follows the age of the date, not the offset written on the row', () => {
        // On its own day the extractor writes days_offset 0. Read as written,
        // every entry would land in the "this week" band however old the date.
        const index = buildOverdueBandIndex(
            [day({ date: '2025-10-30', scheduled_no_time: [planned({ days_offset: 0 })] })],
            SECTIONS,
            TODAY
        );
        assert.deepStrictEqual(index['2025-10-30'], [{ title: SECTIONS.overdueEarlier, count: 1 }]);
    });

    test('splits the backlog exactly as the day view does', () => {
        // Same rows through both helpers: the grid's tooltip and the panels
        // under it must never disagree about which band an entry is in.
        const rows = [planned({ timestamp_repeater: '+1d' }), planned()];
        const fromSections = buildDaySections(
            day({ date: '2025-10-30', overdue: rows.map((t) => ({ ...t, days_offset: -40 })) }),
            SECTIONS
        )
            .filter((section) => section.key.startsWith('overdue-'))
            .map((section) => ({ title: section.title, count: section.items.length }));
        const index = buildOverdueBandIndex([day({ date: '2025-10-30', scheduled_no_time: rows })], SECTIONS, TODAY);
        assert.deepStrictEqual(index['2025-10-30'], fromSections);
        // 40 days back is meant to land in the middle band, so the comparison
        // above is between two filled indexes rather than two empty ones.
        assert.deepStrictEqual(
            fromSections.map((band) => band.title),
            [SECTIONS.overdueRepeat, SECTIONS.overdueEarlier]
        );
    });

    test('a plain timestamp that has been and gone leaves no debt behind', () => {
        // `keeps_a_missed_date` in the extractor: only SCHEDULED and DEADLINE.
        const index = buildOverdueBandIndex(
            [day({ date: '2025-12-02', scheduled_timed: [task({ timestamp_type: 'TIMESTAMP' })] })],
            SECTIONS,
            TODAY
        );
        assert.deepStrictEqual(index, {});
    });

    test('today and the days after it are not broken down at all', () => {
        const index = buildOverdueBandIndex(
            [
                day({ date: TODAY, scheduled_no_time: [planned()] }),
                day({ date: '2025-12-20', scheduled_no_time: [planned()] })
            ],
            SECTIONS,
            TODAY
        );
        assert.deepStrictEqual(index, {});
    });

    test('a date with nothing on it is left out entirely', () => {
        const index = buildOverdueBandIndex([day({ date: '2025-12-02' })], SECTIONS, TODAY);
        assert.deepStrictEqual(index, {});
    });

    test('a payload that is not an array renders as empty rather than throwing', () => {
        assert.deepStrictEqual(buildOverdueBandIndex(undefined as unknown as DayAgenda[], SECTIONS, TODAY), {});
    });
});
