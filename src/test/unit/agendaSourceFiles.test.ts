import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { agendaSourceFiles, agendaSourceRoots } from '../../utils/git/agendaSourceFiles';
import type { DayAgenda, Task } from '../../types';

function task(file: string, heading = 'x'): Task {
    return { file, line: 1, heading, content: '' };
}

function taskIn(root: string, file: string): Task {
    return { ...task(file), root };
}

suite('agendaSourceFiles', () => {
    test('collects every bucket of a day payload', () => {
        const day: DayAgenda = {
            date: '2026-07-27',
            overdue: [task('/repo/a.md')],
            scheduled_timed: [task('/repo/b.md')],
            scheduled_no_time: [task('/repo/c.md')],
            upcoming: [task('/repo/d.md')]
        };
        assert.deepStrictEqual(agendaSourceFiles([day]), ['/repo/a.md', '/repo/b.md', '/repo/c.md', '/repo/d.md']);
    });

    test('tolerates the omitted buckets a week or month payload has', () => {
        const day: DayAgenda = { date: '2026-07-27', scheduled_timed: [task('/repo/a.md')] };
        assert.deepStrictEqual(agendaSourceFiles([day]), ['/repo/a.md']);
    });

    test('reads a flat task list (the Tasks view)', () => {
        assert.deepStrictEqual(agendaSourceFiles([task('/repo/a.md'), task('/repo/b.md')]), [
            '/repo/a.md',
            '/repo/b.md'
        ]);
    });

    test('de-duplicates, keeping the order of first appearance', () => {
        const days: DayAgenda[] = [
            { date: '2026-07-27', scheduled_timed: [task('/repo/b.md'), task('/repo/a.md')] },
            { date: '2026-07-28', scheduled_timed: [task('/repo/a.md'), task('/repo/c.md')] }
        ];
        assert.deepStrictEqual(agendaSourceFiles(days), ['/repo/b.md', '/repo/a.md', '/repo/c.md']);
    });

    test('skips a task whose file is missing or empty', () => {
        // The payload crosses a JSON boundary, so the field is not guaranteed
        // by the type alone; an empty path must not become a lookup.
        const broken = [task(''), { line: 1, heading: 'x', content: '' } as unknown as Task, task('/repo/a.md')];
        assert.deepStrictEqual(agendaSourceFiles(broken), ['/repo/a.md']);
    });

    test('an empty payload yields no files', () => {
        assert.deepStrictEqual(agendaSourceFiles([]), []);
    });
});

suite('agendaSourceRoots', () => {
    test('collects the roots of a day payload in order of first appearance', () => {
        const day: DayAgenda = {
            date: '2026-08-10',
            overdue: [taskIn('/notes/work', '/notes/work/a.md')],
            scheduled_timed: [taskIn('/notes/home', '/notes/home/b.md')],
            scheduled_no_time: [taskIn('/notes/work', '/notes/work/c.md')]
        };
        assert.deepStrictEqual(agendaSourceRoots([day]), ['/notes/work', '/notes/home']);
    });

    test('a single-directory run reports no root, so there is nothing to mark', () => {
        // The extractor omits `root` when it swept one directory: the caller
        // named it and the field would only repeat it back.
        assert.deepStrictEqual(agendaSourceRoots([task('/notes/a.md'), task('/notes/b.md')]), []);
    });
});
