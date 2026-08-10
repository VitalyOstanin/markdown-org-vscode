import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { hideCollections, renderCollectionChips } from '../../utils/agendaCollectionFilter';
import { buildCollectionMarks } from '../../utils/agendaCollections';
import type { DayAgenda, Task } from '../../types';

function task(file: string, root?: string): Task {
    const base: Task = { file, line: 1, heading: file, content: '', task_type: 'TODO' };
    return root === undefined ? base : { ...base, root };
}

const T_WORK = task('/notes/work/plan.md', '/notes/work');
const T_HOME = task('/notes/home/list.md', '/notes/home');
const T_ROOTLESS = task('/notes/loose.md');

function day(tasks: Task[]): DayAgenda[] {
    return [
        {
            date: '2025-12-09',
            overdue: tasks,
            scheduled_timed: tasks,
            scheduled_no_time: [],
            upcoming: tasks
        }
    ];
}

/** The single day the `day()` agenda holds, past the index check. */
function onlyDay(data: DayAgenda[]): DayAgenda {
    const first = data[0];
    assert.ok(first, 'the filtered agenda kept its day');
    return first;
}

const ctx = {
    chipTitle: 'Show or hide the tasks of {0}',
    escapeHtml: (value: string | number | boolean | undefined | null): string =>
        String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;'),
    formatString: (template: string, ...values: string[]): string =>
        template.replaceAll(/\{(\d+)\}/g, (_match, index: string) => values[Number(index)] ?? '')
};

suite('agendaCollectionFilter.hideCollections', () => {
    test('hiding nothing hands the same agenda back', () => {
        const tasks = [T_WORK, T_HOME];
        assert.strictEqual(hideCollections(tasks, []), tasks);
    });

    test('a hidden directory loses its rows in a flat task list', () => {
        const result = hideCollections([T_WORK, T_HOME], ['/notes/work']) as Task[];
        assert.deepStrictEqual(
            result.map((entry) => entry.file),
            ['/notes/home/list.md']
        );
    });

    test('every bucket of a day is filtered, not just the timed one', () => {
        const filtered = onlyDay(hideCollections(day([T_WORK, T_HOME]), ['/notes/work']) as DayAgenda[]);
        const files = (rows: Task[] | undefined) => (rows ?? []).map((entry) => entry.file);
        assert.deepStrictEqual(files(filtered.overdue), ['/notes/home/list.md']);
        assert.deepStrictEqual(files(filtered.scheduled_timed), ['/notes/home/list.md']);
        assert.deepStrictEqual(files(filtered.upcoming), ['/notes/home/list.md']);
    });

    test('a row that reports no directory is never hidden', () => {
        const result = hideCollections([T_WORK, T_ROOTLESS], ['/notes/work']) as Task[];
        assert.deepStrictEqual(
            result.map((entry) => entry.file),
            ['/notes/loose.md']
        );
    });

    test('hiding every directory leaves an empty agenda rather than a full one', () => {
        const result = hideCollections([T_WORK, T_HOME], ['/notes/work', '/notes/home']) as Task[];
        assert.deepStrictEqual(result, []);
    });

    test('the day keeps the fields the agenda is drawn from', () => {
        const filtered = onlyDay(hideCollections(day([T_WORK]), ['/notes/work']) as DayAgenda[]);
        assert.strictEqual(filtered.date, '2025-12-09');
    });
});

suite('agendaCollectionFilter.renderCollectionChips', () => {
    const marks = buildCollectionMarks(['/notes/work', '/notes/home']);

    test('one directory gets no row at all', () => {
        assert.strictEqual(renderCollectionChips([], [], ctx), '');
    });

    test('each directory gets a chip carrying its root, tone and name', () => {
        const html = renderCollectionChips(marks, [], ctx);
        assert.ok(html.includes('data-root="/notes/work" data-tone="0"'));
        assert.ok(html.includes('data-root="/notes/home" data-tone="1"'));
        assert.ok(html.includes('>work</button>'));
        assert.ok(html.includes('title="Show or hide the tasks of home"'));
    });

    test('a hidden directory keeps its chip and is marked off', () => {
        const html = renderCollectionChips(marks, ['/notes/home'], ctx);
        assert.ok(html.includes('class="collection-chip" data-root="/notes/work"'));
        assert.ok(html.includes('class="collection-chip off" data-root="/notes/home"'));
    });

    test('a directory name is escaped rather than pasted into the markup', () => {
        const evil = buildCollectionMarks(['/notes/<b>work</b>', '/notes/home']);
        const html = renderCollectionChips(evil, [], ctx);
        assert.ok(!html.includes('<b>'));
        assert.ok(html.includes('&lt;b&gt;work&lt;/b&gt;'));
    });
});
