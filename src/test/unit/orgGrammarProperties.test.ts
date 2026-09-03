import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import fc from 'fast-check';
import { HEADING_REGEX, matchTimestampLine } from '../../orgPatterns';
import { TIMESTAMP_REGEX } from '../../utils/timestampParts';
import { buildHeading } from '../../utils/buildHeading';
import { buildOrgTimestamp } from '../../utils/orgTimestamp';
import { planPhraseEdit } from '../../utils/phraseEdit';
import { parsePhraseFields } from '../../utils/phraseEntry';
import type { PhraseFields } from '../../utils/phraseEntry';
import type { TaskStatus } from '../../types';

/**
 * Properties over the grammar of a heading and of a timestamp, and over the
 * edit that rewrites both.
 *
 * The lines these read come from outside: a note is written by hand, by Emacs
 * and by the Android client, so the shape of the input is somebody else's
 * choice. The examples beside this file pin what the rules do to lines that
 * were thought of; these pin the invariants the code is written around --
 * build and parse agreeing, an edit that says nothing writing nothing, and a
 * rewrite leaving the lines it did not name alone.
 *
 * The generators are built from the edges rather than from typical values:
 * an empty title, a title that opens with `TODO` or with `[#A]`, priorities at
 * `0`, `64` and `65`, a weekday that is not ASCII, a repeater of every prefix
 * and unit. A counterexample belongs beside the examples as a named test --
 * see DEVELOPMENT.md -- rather than only in the output of a run.
 */

/** 200 rather than fast-check's 100: these are pure functions over short strings. */
const RUNS = { numRuns: 200 };

const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const STATUSES: readonly TaskStatus[] = ['TODO', 'DONE', 'CANCELLED', 'CANCELED'];

/** The whole range the extractor's `Priority::parse` accepts, and its edges. */
const PRIORITIES = ['A', 'B', 'Z', '0', '5', '9', '10', '59', '64'];

/** Titles that make the pieces of a heading ambiguous when read back. */
const TITLES = ['', 'позвонить врачу', 'TODO', 'TODO the other one', '[#A]', '[#5] filter', 'a  b', '## nested'];

const WEEKDAYS = [undefined, 'Пн', 'Вт', 'Mon', 'Fri'];

const REPEATERS = [undefined, '+1d', '++2w', '.+3wd', '+10h', '+1m', '+64y'];

const WARNINGS = [undefined, '-2d', '-1w', '-3h', '-1m', '-1y'];

const heading = fc.record({
    hashes: fc.integer({ min: 1, max: 6 }).map((n) => '#'.repeat(n)),
    status: fc.constantFrom(...STATUSES, undefined),
    priority: fc.constantFrom(...PRIORITIES, undefined),
    title: fc.constantFrom(...TITLES)
});

const timestamp = fc.record({
    year: fc.integer({ min: 1000, max: 9999 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    bracket: fc.constantFrom<'angle' | 'square'>('angle', 'square'),
    weekday: fc.constantFrom(...WEEKDAYS),
    includeTime: fc.boolean(),
    repeater: fc.constantFrom(...REPEATERS),
    warning: fc.constantFrom(...WARNINGS)
});

function buildTimestamp(spec: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    bracket: 'angle' | 'square';
    weekday: string | undefined;
    includeTime: boolean;
    repeater: string | undefined;
    warning: string | undefined;
}): string {
    return buildOrgTimestamp({
        date: new Date(spec.year, spec.month - 1, spec.day, spec.hour, spec.minute),
        bracket: spec.bracket,
        weekday: spec.weekday,
        includeTime: spec.includeTime,
        repeater: spec.repeater,
        warning: spec.warning
    });
}

/** What the extractor answers, with only the named fields set. */
function fields(overrides: Partial<PhraseFields> = {}): PhraseFields {
    return { currentDate: '2026-08-31', heading: '', cleared: [], ...overrides };
}

suite('org grammar properties: a heading', () => {
    test('the pieces a heading is built from are the pieces it is read as', () => {
        // Not "the parts come back verbatim": a title of its own that opens
        // with `TODO` or with a cookie is read as the keyword or the priority,
        // which is what the file says as well. What has to hold is that the
        // reading is stable -- rebuilding from what was read gives the same
        // line, so an edit that rewrites a heading cannot walk it sideways.
        fc.assert(
            fc.property(heading, (parts) => {
                const text = buildHeading(parts);
                const match = HEADING_REGEX.exec(text);
                assert.ok(match?.groups, `built heading is not a heading: ${text}`);
                const groups = match.groups;
                const again = buildHeading({
                    hashes: groups.hashes ?? '#',
                    status: groups.status as TaskStatus | undefined,
                    priority: groups.priority,
                    title: groups.title ?? ''
                });
                assert.equal(again, text);
            }),
            RUNS
        );
    });

    test('a title that names neither a keyword nor a cookie comes back verbatim', () => {
        const plainTitle = fc.constantFrom('позвонить врачу', 'a  b', 'filter', 'the [#A] one');
        fc.assert(
            fc.property(
                fc.record({
                    hashes: fc.integer({ min: 1, max: 6 }).map((n) => '#'.repeat(n)),
                    status: fc.constantFrom(...STATUSES, undefined),
                    priority: fc.constantFrom(...PRIORITIES, undefined),
                    title: plainTitle
                }),
                (parts) => {
                    const match = HEADING_REGEX.exec(buildHeading(parts));
                    assert.ok(match?.groups);
                    assert.equal(match.groups.hashes, parts.hashes);
                    assert.equal(match.groups.status, parts.status);
                    assert.equal(match.groups.priority, parts.priority);
                    assert.equal(match.groups.title, parts.title);
                }
            ),
            RUNS
        );
    });
});

suite('org grammar properties: a timestamp', () => {
    test('every field a timestamp is built with is read back off it', () => {
        // ADR-0005 states the promise this checks: the weekday, the time and
        // the repeater round-trip verbatim.
        fc.assert(
            fc.property(timestamp, (spec) => {
                const text = buildTimestamp(spec);
                const match = TIMESTAMP_REGEX.exec(text);
                assert.ok(match?.groups, `built timestamp does not parse: ${text}`);
                const groups = match.groups;
                assert.equal(groups.year, String(spec.year).padStart(4, '0'));
                assert.equal(groups.month, String(spec.month).padStart(2, '0'));
                assert.equal(groups.day, String(spec.day).padStart(2, '0'));
                assert.equal(groups.weekday, spec.weekday);
                assert.equal(groups.repeater, spec.repeater);
                assert.equal(groups.warning, spec.warning);
                if (spec.includeTime) {
                    assert.equal(groups.hour, String(spec.hour).padStart(2, '0'));
                    assert.equal(groups.minute, String(spec.minute).padStart(2, '0'));
                } else {
                    assert.equal(groups.hour, undefined);
                }
            }),
            RUNS
        );
    });

    test('a planning line taken as a timestamp has a timestamp that reads', () => {
        // The two patterns are separate -- one says "this line is planning",
        // the other reads the stamp apart -- and they are edited apart as
        // well. A line the first takes and the second cannot read leaves the
        // cursor commands silent on a line the panel does act on.
        const line = fc.record({
            indent: fc.constantFrom('', '    ', '\t'),
            keyword: fc.constantFrom('SCHEDULED', 'DEADLINE', 'CLOSED', 'CREATED', ''),
            stamp: timestamp
        });
        fc.assert(
            fc.property(line, (spec) => {
                const bracket = spec.keyword === 'SCHEDULED' || spec.keyword === 'DEADLINE' ? 'angle' : 'square';
                const stamp = buildTimestamp({
                    ...spec.stamp,
                    bracket: spec.keyword === '' ? spec.stamp.bracket : bracket
                });
                const text = `${spec.indent}\`${spec.keyword === '' ? '' : `${spec.keyword}: `}${stamp}\``;
                const taken = matchTimestampLine(text);
                assert.ok(taken, `planning line not taken: ${text}`);
                const parts = TIMESTAMP_REGEX.exec(taken.timestamp);
                assert.ok(parts?.groups, `taken line has an unreadable stamp: ${text}`);
                assert.equal(taken.indent, spec.indent);
            }),
            RUNS
        );
    });
});

suite('org grammar properties: an edit by phrase', () => {
    const said = fc.record({
        keyword: fc.constantFrom<TaskStatus | undefined>(...STATUSES, undefined),
        priority: fc.constantFrom(...PRIORITIES, undefined),
        date: fc.constantFrom(undefined, '2026-09-04', '2026-12-31'),
        time: fc.constantFrom(undefined, '15:00', '00:00'),
        repeater: fc.constantFrom(...REPEATERS),
        planning: fc.constantFrom<'scheduled' | 'deadline' | undefined>(undefined, 'scheduled', 'deadline'),
        cleared: fc.subarray(['date', 'time', 'repeater', 'priority'])
    });

    const entry = fc.constantFrom(
        ['## TODO [#B] позвонить врачу', '    `SCHEDULED: <2026-09-01 Вт 15:00 +1w>`'],
        ['## TODO позвонить врачу'],
        ['## DONE [#A] задача', '    `DEADLINE: <2026-09-01 Вт>`'],
        ['# заметка', '    `CREATED: [2026-08-31 пн 14:01]`']
    );

    const file = fc.record({ entry, tail: fc.constantFrom([], ['', 'Текст под записью.'], ['## следующая']) });

    test('saying the same thing twice writes nothing the second time', () => {
        fc.assert(
            fc.property(file, said, (shape, phrase) => {
                const lines = [...shape.entry, ...shape.tail];
                const first = planPhraseEdit({ lines, heading: 0, fields: fields(phrase), weekdays: RU_DAYS });
                const second = planPhraseEdit({
                    lines: first.lines,
                    heading: 0,
                    fields: fields(phrase),
                    weekdays: RU_DAYS
                });
                assert.deepEqual(second.lines, first.lines);
                assert.deepEqual(second.changed, []);
            }),
            RUNS
        );
    });

    test('the lines the phrase did not name are the lines they were', () => {
        // The plan rewrites the file whole, so what it leaves alone has to be
        // left alone by construction: the entry may gain or lose its planning
        // line, and nothing else moves.
        fc.assert(
            fc.property(file, said, (shape, phrase) => {
                const lines = ['# заголовок файла', '', ...shape.entry, ...shape.tail];
                const heading = 2;
                const result = planPhraseEdit({ lines, heading, fields: fields(phrase), weekdays: RU_DAYS });
                assert.ok(Math.abs(result.lines.length - lines.length) <= 1, 'at most one line comes or goes');
                assert.deepEqual(result.lines.slice(0, heading), lines.slice(0, heading));
                const tail = shape.tail.length;
                if (tail > 0) {
                    assert.deepEqual(result.lines.slice(result.lines.length - tail), lines.slice(lines.length - tail));
                }
            }),
            RUNS
        );
    });

    test('a phrase that says nothing is refused rather than applied', () => {
        fc.assert(
            fc.property(file, (shape) => {
                const lines = [...shape.entry, ...shape.tail];
                const result = planPhraseEdit({ lines, heading: 0, fields: fields(), weekdays: RU_DAYS });
                assert.equal(result.refusal, 'nothing-said');
                assert.deepEqual(result.lines, lines);
            }),
            RUNS
        );
    });
});

suite('org grammar properties: the extractor answer', () => {
    test('any answer is either read into fields or refused by name', () => {
        // The answer comes from another process, and the module is written to
        // check it rather than trust it: an unreadable answer must name itself
        // instead of surfacing later as an entry with an empty heading.
        fc.assert(
            fc.property(fc.jsonValue(), (value) => {
                try {
                    const parsed = parsePhraseFields(JSON.stringify(value));
                    assert.equal(typeof parsed.heading, 'string');
                    assert.equal(typeof parsed.currentDate, 'string');
                    assert.ok(Array.isArray(parsed.cleared));
                } catch (error) {
                    assert.ok(error instanceof Error);
                    assert.ok(error.message.startsWith('parse-phrase:'), `unnamed refusal: ${error.message}`);
                }
            }),
            RUNS
        );
    });

    test('an answer that is not JSON at all is refused by name too', () => {
        fc.assert(
            fc.property(fc.string(), (text) => {
                try {
                    parsePhraseFields(text);
                } catch (error) {
                    assert.ok(error instanceof Error);
                    assert.ok(error.message.startsWith('parse-phrase:'), `unnamed refusal: ${error.message}`);
                }
            }),
            RUNS
        );
    });
});
