import * as assert from 'assert';
import { filterTasksByTag } from '../utils/tagFilter';
import { FileTag, Task, DayAgenda } from '../types';

const TAGS: FileTag[] = [
    { name: 'ALL', pattern: '' },
    { name: 'WORK', pattern: 'work' },
    { name: 'PROJECT', pattern: 'project' },
    { name: 'OTHER', pattern: '!' }
];

function task(file: string, heading: string = 'task'): Task {
    return {
        file,
        line: 1,
        heading,
        content: '',
        task_type: 'TODO'
    };
}

const T_WORK = task('/home/u/notes/work-tasks.md');
const T_PROJECT = task('/home/u/notes/project-plan.md');
const T_PERSONAL = task('/home/u/notes/shopping.md');
const T_PATH_TRAP = task('/home/u/networking/notes.md'); // "work" substring inside "network"

const TASKS: Task[] = [T_WORK, T_PROJECT, T_PERSONAL, T_PATH_TRAP];

function dayAgenda(tasks: Task[]): DayAgenda[] {
    return [
        {
            date: '2025-12-09',
            overdue: [],
            scheduled_timed: tasks,
            scheduled_no_time: [],
            upcoming: []
        }
    ];
}

suite('Tag Filter Unit Tests', () => {
    suite('Empty pattern (ALL semantics)', () => {
        test('empty pattern returns everything', () => {
            const result = filterTasksByTag(TASKS, 'ALL', TAGS) as Task[];
            assert.strictEqual(result.length, 4);
        });

        test('empty pattern works even with positives configured', () => {
            const result = filterTasksByTag(TASKS, 'ALL', TAGS) as Task[];
            assert.deepStrictEqual(result.map((t) => t.file).sort(), TASKS.map((t) => t.file).sort());
        });
    });

    suite('Positive pattern (basename substring)', () => {
        test('WORK matches files with "work" in basename', () => {
            const result = filterTasksByTag(TASKS, 'WORK', TAGS) as Task[];
            assert.deepStrictEqual(
                result.map((t) => t.file),
                [T_WORK.file]
            );
        });

        test('PROJECT matches files with "project" in basename', () => {
            const result = filterTasksByTag(TASKS, 'PROJECT', TAGS) as Task[];
            assert.deepStrictEqual(
                result.map((t) => t.file),
                [T_PROJECT.file]
            );
        });

        test('pattern does NOT match against directory components', () => {
            // /home/u/networking/notes.md must not be tagged WORK ("work" appears
            // in the parent directory "networking" but not in the basename).
            const result = filterTasksByTag([T_PATH_TRAP], 'WORK', TAGS) as Task[];
            assert.strictEqual(result.length, 0);
        });
    });

    suite('Negation pattern', () => {
        test('OTHER excludes tasks matching any positive pattern', () => {
            const result = filterTasksByTag(TASKS, 'OTHER', TAGS) as Task[];
            const files = result.map((t) => t.file).sort();
            assert.deepStrictEqual(files, [T_PATH_TRAP.file, T_PERSONAL.file].sort());
        });

        test('"!work" behaves the same as "!" — the text after ! is ignored', () => {
            const customTags: FileTag[] = [
                { name: 'WORK', pattern: 'work' },
                { name: 'PROJECT', pattern: 'project' },
                { name: 'NEG_A', pattern: '!' },
                { name: 'NEG_B', pattern: '!work' },
                { name: 'NEG_C', pattern: '!xyz' }
            ];
            const a = filterTasksByTag(TASKS, 'NEG_A', customTags) as Task[];
            const b = filterTasksByTag(TASKS, 'NEG_B', customTags) as Task[];
            const c = filterTasksByTag(TASKS, 'NEG_C', customTags) as Task[];
            const sorted = (arr: Task[]) => arr.map((t) => t.file).sort();
            assert.deepStrictEqual(sorted(a), sorted(b));
            assert.deepStrictEqual(sorted(a), sorted(c));
        });

        test('with only positives in fileTags, negation excludes matchers and keeps the rest', () => {
            const simple: FileTag[] = [
                { name: 'WORK', pattern: 'work' },
                { name: 'PRIVATE', pattern: '!' }
            ];
            const result = filterTasksByTag(TASKS, 'PRIVATE', simple) as Task[];
            const files = result.map((t) => t.file).sort();
            assert.deepStrictEqual(files, [T_PATH_TRAP.file, T_PERSONAL.file, T_PROJECT.file].sort());
        });
    });

    suite('Unknown tag', () => {
        test('returns data unchanged when tag is not in fileTags', () => {
            const result = filterTasksByTag(TASKS, 'NOT_A_REAL_TAG', TAGS) as Task[];
            assert.strictEqual(result.length, TASKS.length);
        });

        test('falls back to "no filter" when fileTags is empty', () => {
            const result = filterTasksByTag(TASKS, 'ALL', []) as Task[];
            assert.strictEqual(result.length, TASKS.length);
        });
    });

    suite('Day agenda data shape', () => {
        test('filters each per-day bucket independently', () => {
            const day: DayAgenda = {
                date: '2025-12-09',
                overdue: [T_WORK],
                scheduled_timed: [T_PROJECT, T_PERSONAL],
                scheduled_no_time: [T_PATH_TRAP],
                upcoming: [T_WORK]
            };
            const result = filterTasksByTag([day], 'WORK', TAGS) as DayAgenda[];
            assert.strictEqual(result.length, 1);
            const r = result[0];
            assert.deepStrictEqual(
                r.overdue.map((t) => t.file),
                [T_WORK.file]
            );
            assert.deepStrictEqual(
                r.scheduled_timed.map((t) => t.file),
                []
            );
            assert.deepStrictEqual(
                r.scheduled_no_time.map((t) => t.file),
                []
            );
            assert.deepStrictEqual(
                r.upcoming.map((t) => t.file),
                [T_WORK.file]
            );
        });

        test('preserves the date field on filtered days', () => {
            const result = filterTasksByTag(dayAgenda(TASKS), 'WORK', TAGS) as DayAgenda[];
            assert.strictEqual(result[0].date, '2025-12-09');
        });
    });
});
