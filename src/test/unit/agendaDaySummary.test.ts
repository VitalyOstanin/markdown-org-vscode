import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    OVERDUE_LONG_AGO_DAYS,
    OVERDUE_RECENT_DAYS,
    buildDaySections,
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
        assert.deepStrictEqual(titles, [
            'Запланировано на сегодня',
            'Без времени и предстоящие',
            'Просрочено на этой неделе'
        ]);
    });

    test('item count matches the source bucket sizes', () => {
        const d = day({ scheduled_timed: [task(), task(), task()] });
        assert.strictEqual(buildDaySections(d, SECTIONS)[0]!.items.length, 3);
    });
});
