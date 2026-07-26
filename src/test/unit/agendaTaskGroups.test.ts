import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildTaskGroups, computeTasksSummary } from '../../utils/agendaTaskGroups';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';
import type { Task } from '../../types';

// Group titles are handed in rather than baked into the helper, so the tasks
// card speaks the configured UI language (see agendaI18n.ts).
const GROUPS = AGENDA_STRINGS.en.groups;

// The Tasks view (date-less `--tasks` mode) renders these groups as stacked
// section panels. The webview embeds both helpers via `.toString()`, so these
// unit tests transitively cover the rendered grouping and counts.
function task(overrides: Partial<Task> = {}): Task {
    return {
        file: '/w/notes.md',
        line: 1,
        heading: 'Task',
        content: '',
        task_type: 'TODO',
        ...overrides
    };
}

suite('computeTasksSummary', () => {
    test('counts the whole payload', () => {
        const tasks = [task(), task({ priority: 'A' }), task({ priority: 'B' })];
        assert.deepStrictEqual(computeTasksSummary(tasks), { total: 3, highPriority: 1, done: 0 });
    });

    test('highPriority counts only [#A], done counts only DONE', () => {
        const tasks = [
            task({ priority: 'A', task_type: 'DONE' }),
            task({ priority: 'A' }),
            task({ priority: 'C', task_type: 'DONE' }),
            task({ task_type: 'CANCELLED' })
        ];
        assert.deepStrictEqual(computeTasksSummary(tasks), { total: 4, highPriority: 2, done: 2 });
    });

    test('an empty or missing payload yields zeroes rather than throwing', () => {
        assert.deepStrictEqual(computeTasksSummary([]), { total: 0, highPriority: 0, done: 0 });
        assert.deepStrictEqual(computeTasksSummary(undefined as unknown as Task[]), {
            total: 0,
            highPriority: 0,
            done: 0
        });
    });
});

suite('buildTaskGroups', () => {
    test('groups by priority, highest first, backlog last', () => {
        const groups = buildTaskGroups(
            [
                task({ heading: 'plain' }),
                task({ heading: 'c', priority: 'C' }),
                task({ heading: 'a', priority: 'A' }),
                task({ heading: 'b', priority: 'B' })
            ],
            GROUPS
        );
        assert.deepStrictEqual(
            groups.map((g) => [g.key, g.title, g.items.length]),
            [
                ['a', 'Priority A', 1],
                ['b', 'Priority B', 1],
                ['c', 'Priority C', 1],
                ['none', 'No priority', 1]
            ]
        );
        assert.strictEqual(groups[0]!.items[0]!.heading, 'a');
        assert.strictEqual(groups[3]!.items[0]!.heading, 'plain');
    });

    test('empty groups are dropped so no "(0)" panel is rendered', () => {
        const groups = buildTaskGroups([task({ priority: 'B' }), task({ priority: 'B' })], GROUPS);
        assert.deepStrictEqual(
            groups.map((g) => g.key),
            ['b']
        );
        assert.strictEqual(groups[0]!.items.length, 2);
    });

    test('input order is preserved inside a group', () => {
        const groups = buildTaskGroups(
            [task({ heading: 'first', priority: 'A' }), task({ heading: 'second', priority: 'A' })],
            GROUPS
        );
        assert.deepStrictEqual(
            groups[0]!.items.map((t) => t.heading),
            ['first', 'second']
        );
    });

    test('a lowercase cookie lands in its letter group, not the backlog', () => {
        const groups = buildTaskGroups([task({ priority: 'a' }), task({ priority: ' b ' })], GROUPS);
        assert.deepStrictEqual(
            groups.map((g) => g.key),
            ['a', 'b']
        );
    });

    test('an unknown priority letter falls back to the backlog group', () => {
        const groups = buildTaskGroups([task({ priority: 'Z' })], GROUPS);
        assert.deepStrictEqual(
            groups.map((g) => g.key),
            ['none']
        );
    });

    test('an empty or missing payload yields no groups', () => {
        assert.deepStrictEqual(buildTaskGroups([], GROUPS), []);
        assert.deepStrictEqual(buildTaskGroups(undefined as unknown as Task[], GROUPS), []);
    });

    test('group titles come from the supplied labels, not from the helper', () => {
        const groups = buildTaskGroups([task({ priority: 'A' }), task()], AGENDA_STRINGS.ru.groups);
        assert.deepStrictEqual(
            groups.map((g) => g.title),
            ['Приоритет A', 'Без приоритета']
        );
    });
});
