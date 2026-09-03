import * as assert from 'node:assert/strict';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'mocha';
import fc from 'fast-check';
import { CLOCK_REGEX, HEADING_REGEX, matchTimestampLine } from '../../orgPatterns';
import { findBundledBinary } from '../../utils/bundledBinary';

/**
 * The grammar written here against the grammar it says it mirrors.
 *
 * Four places in this extension state that a pattern follows the extractor's:
 * the CLOCK line, the priority cookie, the repeater and the warning cookie.
 * The way they come apart is quiet -- a line one side counts and the other
 * skips makes the two disagree about the same file's total clock time, with
 * nothing raised anywhere. So the lines are generated, written to a file, and
 * the answer of the real binary is put beside what these patterns say about
 * the same lines.
 *
 * What is compared is acceptance and value -- was the line taken, and what
 * priority, heading text and timestamp type did it yield -- not the whole
 * shape of the answer, which would break on every pin bump for no reason.
 *
 * Skipped when the binary is not there: it is downloaded into `bin/` by the
 * build, and the unit suite has to run without it.
 */

// Through the same lookup the extension uses, so the name carries `.exe` on
// Windows and an unpopulated `bin/` reads as "not there" rather than as a
// path that fails on the first run.
const BINARY = findBundledBinary(path.join(__dirname, '..', '..', '..'), process.platform);

/** A process per file, so this runs far fewer cases than the pure properties. */
const RUNS = { numRuns: 24 };

interface ExtractedTask {
    line: number;
    heading: string;
    priority?: string | null;
    task_type?: string | null;
    timestamp_type?: string | null;
    clocks?: unknown[];
}

/** The cookies at the edges of what `Priority::parse` takes, and just past them. */
const COOKIES = ['', '[#A]', '[#Z]', '[#0]', '[#5]', '[#64]', '[#65]', '[#01]', '[#z]', '[#AA]'];

const KEYWORDS = ['TODO', 'DONE', 'CANCELLED'];

const PLANNING = [
    '',
    '    `SCHEDULED: <2026-09-04 Пт 15:00 +1w>`',
    '    `DEADLINE: <2026-09-01 Вт -2d>`',
    '    `CLOSED: [2026-09-01 Вт 12:00]`',
    '    `CREATED: [2026-08-31 Пн 14:01]`',
    '    `<2026-09-02 Ср 09:00>`',
    '    `SCHEDULED: [2026-09-04 Пт]`'
];

const CLOCKS = [
    '',
    '    `CLOCK: [2026-09-01 Пн 10:00]--[2026-09-01 Пн 11:30] => 1:30`',
    '    `CLOCK: [2026-09-01 Пн 10:00]--[2026-09-01 Пн 11:30]`',
    '    `CLOCK: <2026-09-01 Пн 10:00>--[2026-09-01 Пн 11:30] => 1:30`',
    '    `CLOCK: [2026-09-01 Пн 10:00]`',
    '    `CLOCK: [2026-09-01 10:00]--[2026-09-01 11:30] => 1:30`'
];

const entry = fc.record({
    keyword: fc.constantFrom(...KEYWORDS),
    cookie: fc.constantFrom(...COOKIES),
    planning: fc.constantFrom(...PLANNING),
    clock: fc.constantFrom(...CLOCKS)
});

interface Entry {
    keyword: string;
    cookie: string;
    planning: string;
    clock: string;
}

/** The file, and which line each entry's heading landed on (1-based, as the JSON counts). */
function writeNote(entries: readonly Entry[], dir: string): { headingLines: number[] } {
    const lines: string[] = ['# Notes', ''];
    const headingLines: number[] = [];
    entries.forEach((spec, index) => {
        headingLines.push(lines.length + 1);
        const cookie = spec.cookie === '' ? '' : `${spec.cookie} `;
        lines.push(`## ${spec.keyword} ${cookie}entry ${String(index)}`);
        if (spec.planning !== '') {
            lines.push(spec.planning);
        }
        if (spec.clock !== '') {
            lines.push(spec.clock);
        }
        lines.push('');
    });
    fs.writeFileSync(path.join(dir, 'notes.md'), lines.join('\n'), 'utf8');
    return { headingLines };
}

function runExtractor(dir: string): ExtractedTask[] {
    const out = cp.execFileSync(
        BINARY ?? '',
        ['--dir', dir, '--tasks', '--tasks-include-done', '--tasks-include-cancelled', '--quiet'],
        { encoding: 'utf8' }
    );
    return JSON.parse(out) as ExtractedTask[];
}

suite('the extractor and the patterns written after it', function () {
    // A process per generated file; the default 2s is not enough for 24 of them.
    this.timeout(60_000);

    const available = BINARY !== undefined;

    test('a heading is read the same way on both sides', function () {
        if (!available) {
            this.skip();
        }
        fc.assert(
            fc.property(fc.array(entry, { minLength: 1, maxLength: 8 }), (entries) => {
                const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-diff-'));
                try {
                    const { headingLines } = writeNote(entries, dir);
                    const answered = new Map(runExtractor(dir).map((task) => [task.line, task]));
                    const text = fs.readFileSync(path.join(dir, 'notes.md'), 'utf8').split('\n');
                    entries.forEach((spec, index) => {
                        const lineNumber = headingLines[index] ?? 0;
                        const task = answered.get(lineNumber);
                        assert.ok(task, `the extractor skipped a heading this side reads: ${text[lineNumber - 1]}`);
                        const groups = HEADING_REGEX.exec(text[lineNumber - 1] ?? '')?.groups;
                        assert.ok(groups, `this side does not read a heading the extractor took: ${task.heading}`);
                        assert.equal(groups.status, task.task_type ?? undefined, 'the keyword');
                        assert.equal(groups.priority, task.priority ?? undefined, 'the priority cookie');
                        assert.equal(groups.title, task.heading, 'the text left after the tokens');
                    });
                } finally {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            }),
            RUNS
        );
    });

    test('a CLOCK line is counted by both or by neither', function () {
        if (!available) {
            this.skip();
        }
        fc.assert(
            fc.property(fc.array(entry, { minLength: 1, maxLength: 8 }), (entries) => {
                const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-diff-'));
                try {
                    const { headingLines } = writeNote(entries, dir);
                    const answered = new Map(runExtractor(dir).map((task) => [task.line, task]));
                    entries.forEach((spec, index) => {
                        const task = answered.get(headingLines[index] ?? 0);
                        const counted = task?.clocks?.length ?? 0;
                        const taken = spec.clock !== '' && CLOCK_REGEX.test(spec.clock) ? 1 : 0;
                        assert.equal(counted, taken, `the CLOCK line: ${spec.clock}`);
                    });
                } finally {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            }),
            RUNS
        );
    });

    test('a planning line is typed the same way on both sides', function () {
        if (!available) {
            this.skip();
        }
        fc.assert(
            fc.property(fc.array(entry, { minLength: 1, maxLength: 8 }), (entries) => {
                const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-diff-'));
                try {
                    const { headingLines } = writeNote(entries, dir);
                    const answered = new Map(runExtractor(dir).map((task) => [task.line, task]));
                    entries.forEach((spec, index) => {
                        if (spec.planning === '') {
                            return;
                        }
                        const task = answered.get(headingLines[index] ?? 0);
                        const taken = matchTimestampLine(spec.planning);
                        // CREATED and CLOSED are not the entry's planning: the
                        // extractor types the entry by the date it owes, and a
                        // line it does not carry leaves `timestamp_type` unset.
                        if (!taken || taken.type === 'CREATED') {
                            return;
                        }
                        assert.equal(task?.timestamp_type ?? undefined, taken.type, `the line: ${spec.planning}`);
                    });
                } finally {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            }),
            RUNS
        );
    });
});
