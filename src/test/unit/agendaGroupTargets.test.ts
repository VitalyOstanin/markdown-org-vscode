import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { asBulkAction, groupTargets } from '../../utils/agendaGroupTargets';
import type { DayAgenda, Task, TaskWithOffset } from '../../types';

const LABELS = {
    scheduled: 'At a set time',
    allday: 'All-day & upcoming',
    overdueRepeat: 'Missed repeats',
    overdueRecent: 'Overdue this week',
    overdueEarlier: 'Overdue earlier',
    overdueLong: 'Overdue long ago'
};

function task(overrides: Partial<TaskWithOffset>): TaskWithOffset {
    return {
        file: '/notes/inbox.md',
        line: 1,
        heading: 'Pay the bill',
        content: '',
        timestamp_type: 'SCHEDULED',
        days_offset: -3,
        ...overrides
    };
}

function day(overdue: TaskWithOffset[]): DayAgenda[] {
    return [{ date: '2026-08-10', overdue, scheduled_timed: [], scheduled_no_time: [], upcoming: [] }];
}

suite('agendaGroupTargets.asBulkAction', () => {
    test('accepts the three actions the menu offers', () => {
        assert.strictEqual(asBulkAction('move-to-today'), 'move-to-today');
        assert.strictEqual(asBulkAction('drop-planning'), 'drop-planning');
        assert.strictEqual(asBulkAction('cancel'), 'cancel');
    });

    test('anything else is not an action', () => {
        assert.strictEqual(asBulkAction('delete'), undefined);
        assert.strictEqual(asBulkAction(''), undefined);
        assert.strictEqual(asBulkAction(undefined), undefined);
    });
});

suite('agendaGroupTargets.groupTargets', () => {
    test('returns the band the key names, and only it', () => {
        const data = day([
            task({ line: 3, heading: 'This week', days_offset: -2 }),
            task({ line: 9, heading: 'Last spring', days_offset: -100 })
        ]);

        assert.deepStrictEqual(groupTargets(data, 'overdue-recent', LABELS), [
            { file: '/notes/inbox.md', line: 3, heading: 'This week', keyword: 'SCHEDULED' }
        ]);
        assert.deepStrictEqual(groupTargets(data, 'overdue-earlier', LABELS), [
            { file: '/notes/inbox.md', line: 9, heading: 'Last spring', keyword: 'SCHEDULED' }
        ]);
    });

    test('the keyword the row was listed under travels with the target', () => {
        const data = day([task({ timestamp_type: 'DEADLINE' })]);
        assert.strictEqual(groupTargets(data, 'overdue-recent', LABELS)[0]?.keyword, 'DEADLINE');
    });

    test('a timestamp type that is not a planning line leaves the keyword open', () => {
        const data = day([task({ timestamp_type: 'CREATED' })]);
        assert.strictEqual(groupTargets(data, 'overdue-recent', LABELS)[0]?.keyword, undefined);
    });

    test('a repeating entry belongs to the repeats band whatever its age', () => {
        const data = day([task({ days_offset: -400, timestamp_repeater: '++2d' })]);
        assert.strictEqual(groupTargets(data, 'overdue-long', LABELS).length, 0);
        assert.strictEqual(groupTargets(data, 'overdue-repeat', LABELS).length, 1);
    });

    test('a task with no file is left out rather than sent nameless', () => {
        const data = day([task({ file: '' }), task({ line: 5, heading: 'Named' })]);
        assert.deepStrictEqual(
            groupTargets(data, 'overdue-recent', LABELS).map((t) => t.heading),
            ['Named']
        );
    });

    test('a key no section carries yields nothing', () => {
        assert.deepStrictEqual(groupTargets(day([task({})]), 'overdue-repeat', LABELS), []);
        assert.deepStrictEqual(groupTargets(day([task({})]), 'scheduled', LABELS), []);
    });

    test('a flat task list -- the tasks view -- is not a day agenda', () => {
        const tasks: Task[] = [{ file: '/notes/inbox.md', line: 1, heading: 'Pay the bill', content: '' }];
        assert.deepStrictEqual(groupTargets(tasks, 'overdue-recent', LABELS), []);
    });

    test('an empty payload yields nothing', () => {
        assert.deepStrictEqual(groupTargets([], 'overdue-recent', LABELS), []);
    });

    test('a payload that is not a list of days yields nothing', () => {
        // The webview sends what it last rendered, and a panel that has not
        // rendered yet sends the empty shape rather than an array. Reading a
        // day out of that would act on rows nobody selected.
        assert.deepStrictEqual(
            groupTargets({} as unknown as Parameters<typeof groupTargets>[0], 'overdue-recent', LABELS),
            []
        );
    });

    test('the named day is the one acted on, not the first of the week', () => {
        // The week view stands the same band under seven day headers, so the
        // key alone would answer with the first day's rows -- other files, and
        // no way for the reader to tell before the edit was made.
        const week: DayAgenda[] = [
            {
                date: '2026-08-10',
                overdue: [task({ file: '/notes/monday.md', heading: 'Monday' })],
                scheduled_timed: [],
                scheduled_no_time: [],
                upcoming: []
            },
            {
                date: '2026-08-12',
                overdue: [task({ file: '/notes/wednesday.md', heading: 'Wednesday' })],
                scheduled_timed: [],
                scheduled_no_time: [],
                upcoming: []
            }
        ];

        assert.deepStrictEqual(
            groupTargets(week, 'overdue-recent', LABELS, [], '2026-08-12').map((t) => t.heading),
            ['Wednesday']
        );
        assert.deepStrictEqual(
            groupTargets(week, 'overdue-recent', LABELS).map((t) => t.heading),
            ['Monday'],
            'the day view names no date and gets the single day it rendered'
        );
        assert.deepStrictEqual(
            groupTargets(week, 'overdue-recent', LABELS, [], '2026-08-13'),
            [],
            'a day the payload no longer holds is answered with nothing, not with another day'
        );
    });

    test('a row of a hidden directory is not a target, because it is not on screen', () => {
        const data = day([
            task({ root: '/a', file: '/a/inbox.md', line: 3, heading: 'Shown' }),
            task({ root: '/b', file: '/b/inbox.md', line: 4, heading: 'Hidden by its chip' })
        ]);

        assert.deepStrictEqual(
            groupTargets(data, 'overdue-recent', LABELS, ['/b']).map((t) => t.heading),
            ['Shown']
        );
        assert.deepStrictEqual(
            groupTargets(data, 'overdue-recent', LABELS, []).map((t) => t.heading),
            ['Shown', 'Hidden by its chip'],
            'with every chip on, the band is whole'
        );
    });
});
