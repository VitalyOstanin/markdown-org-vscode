import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { planPhraseEdit } from '../../utils/phraseEdit';
import type { PhraseEditOptions } from '../../utils/phraseEdit';
import type { PhraseFields } from '../../utils/phraseEntry';

const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** What the extractor answers, with only the named fields set. */
function fields(overrides: Partial<PhraseFields> = {}): PhraseFields {
    return { currentDate: '2026-08-31', heading: '', cleared: [], ...overrides };
}

/** An entry with a keyword, a priority and a dated planning line under it. */
const ENTRY = [
    '# Заметки',
    '',
    '## TODO [#B] позвонить врачу',
    '    `CREATED: [2026-08-31 пн 14:01]`',
    '    `SCHEDULED: <2026-09-01 Вт 15:00 +1w>`',
    '',
    'Текст под записью.'
];

function plan(lines: readonly string[], said: Partial<PhraseFields>, heading = 2) {
    const options: PhraseEditOptions = { lines, heading, fields: fields(said), weekdays: RU_DAYS };
    return planPhraseEdit(options);
}

suite('planPhraseEdit', () => {
    test('the keyword the phrase named replaces the one the heading carries', () => {
        const result = plan(ENTRY, { keyword: 'DONE' });

        assert.deepStrictEqual(result.changed, ['keyword']);
        assert.strictEqual(result.lines[2], '## DONE [#B] позвонить врачу');
        // Nothing else moved: the planning line is the one it was.
        assert.strictEqual(result.lines[4], '    `SCHEDULED: <2026-09-01 Вт 15:00 +1w>`');
    });

    test('a priority the phrase emptied leaves the keyword alone', () => {
        const result = plan(ENTRY, { cleared: ['priority'] });

        assert.deepStrictEqual(result.changed, ['priority']);
        assert.strictEqual(result.lines[2], '## TODO позвонить врачу');
    });

    test('a day the phrase named moves the planning line and keeps the rest of it', () => {
        // The hour, the repeater and the weekday come along: the phrase named
        // a day and nothing else about the timestamp.
        const result = plan(ENTRY, { date: '2026-09-04', planning: 'scheduled' });

        assert.deepStrictEqual(result.changed, ['date']);
        assert.strictEqual(result.lines[4], '    `SCHEDULED: <2026-09-04 Пт 15:00 +1w>`');
    });

    test('a deadline said outright moves the date onto the other line', () => {
        const result = plan(ENTRY, { date: '2026-09-04', planning: 'deadline' });

        assert.strictEqual(result.lines[4], '    `DEADLINE: <2026-09-04 Пт 15:00 +1w>`');
    });

    test('emptying the date takes the planning line out', () => {
        const result = plan(ENTRY, { cleared: ['date'] });

        assert.deepStrictEqual(result.changed, ['date']);
        assert.strictEqual(result.lines.length, ENTRY.length - 1);
        assert.ok(!result.lines.some((line) => line.includes('SCHEDULED')));
        // The mark above it stays: only the planning line was asked for.
        assert.strictEqual(result.lines[3], '    `CREATED: [2026-08-31 пн 14:01]`');
    });

    test('emptying the hour leaves the day and the repeater', () => {
        const result = plan(ENTRY, { cleared: ['time'] });

        assert.deepStrictEqual(result.changed, ['time']);
        assert.strictEqual(result.lines[4], '    `SCHEDULED: <2026-09-01 Вт +1w>`');
    });

    test('emptying the repeater leaves the day and the hour', () => {
        const result = plan(ENTRY, { cleared: ['repeater'] });

        assert.deepStrictEqual(result.changed, ['repeater']);
        assert.strictEqual(result.lines[4], '    `SCHEDULED: <2026-09-01 Вт 15:00>`');
    });

    test('an entry without a planning line gains one under the creation mark', () => {
        const undated = ['## TODO купить хлеб', '    `CREATED: [2026-08-31 пн 14:01]`', '', 'текст'];

        const result = plan(undated, { date: '2026-09-04', planning: 'scheduled' }, 0);

        assert.deepStrictEqual(result.changed, ['date']);
        assert.deepStrictEqual(result.lines, [
            '## TODO купить хлеб',
            '    `CREATED: [2026-08-31 пн 14:01]`',
            '    `SCHEDULED: <2026-09-04 Пт>`',
            '',
            'текст'
        ]);
    });

    test('an hour with no day to hang it on is refused', () => {
        // Both the phrase and the entry are without a date, and an org
        // timestamp cannot say an hour on its own.
        const undated = ['## TODO купить хлеб', 'текст'];

        const result = plan(undated, { time: '16:00' }, 0);

        assert.strictEqual(result.refusal, 'no-date-to-put-it-on');
        assert.deepStrictEqual(result.lines, undated);
    });

    test('a line past the end of the note is refused like any other non-heading', () => {
        const result = plan(ENTRY, { keyword: 'DONE' }, ENTRY.length + 3);

        assert.strictEqual(result.refusal, 'not-a-heading');
        assert.deepStrictEqual(result.lines, [...ENTRY]);
    });

    test('a phrase that named nothing is refused', () => {
        const result = plan(ENTRY, {});

        assert.strictEqual(result.refusal, 'nothing-said');
        assert.deepStrictEqual(result.lines, [...ENTRY]);
    });

    test('a line that is not a heading is refused', () => {
        const result = plan(ENTRY, { keyword: 'DONE' }, 6);

        assert.strictEqual(result.refusal, 'not-a-heading');
        assert.deepStrictEqual(result.lines, [...ENTRY]);
    });

    test('a phrase that says what the entry already says writes nothing', () => {
        const result = plan(ENTRY, { keyword: 'TODO', priority: 'B' });

        assert.deepStrictEqual(result.changed, []);
        assert.strictEqual(result.refusal, undefined);
        assert.deepStrictEqual(result.lines, [...ENTRY]);
    });

    test('an entry whose next heading comes before any planning line gains one', () => {
        const notes = ['## TODO купить хлеб', 'текст', '## TODO позвонить', '    `SCHEDULED: <2026-09-01 Вт>`'];

        const result = plan(notes, { date: '2026-09-04', planning: 'scheduled' }, 0);

        assert.deepStrictEqual(result.changed, ['date']);
        // Written under its own heading, not into the entry below that owns
        // the only planning line in the file.
        assert.strictEqual(result.lines[1], '`SCHEDULED: <2026-09-04 Пт>`');
        assert.strictEqual(result.lines[4], '    `SCHEDULED: <2026-09-01 Вт>`');
    });

    test('an hour named for a dated entry that had none joins the line it has', () => {
        const dated = ['## TODO купить хлеб', '`SCHEDULED: <2026-09-01 Вт>`', 'текст'];

        const result = plan(dated, { time: '16:00' }, 0);

        assert.deepStrictEqual(result.changed, ['time']);
        assert.strictEqual(result.lines[1], '`SCHEDULED: <2026-09-01 Вт 16:00>`');
    });

    test('the warning the timestamp carries survives the rewrite', () => {
        const warned = ['## TODO купить хлеб', '`SCHEDULED: <2026-09-01 Вт +1w -2d>`', 'текст'];

        const result = plan(warned, { date: '2026-09-04', planning: 'scheduled' }, 0);

        assert.strictEqual(result.lines[1], '`SCHEDULED: <2026-09-04 Пт +1w -2d>`');
    });

    test("a timestamp written without a weekday is given the screen's", () => {
        const bare = ['## TODO купить хлеб', '`SCHEDULED: <2026-09-01>`', 'текст'];

        const result = plan(bare, { date: '2026-09-04', planning: 'scheduled' }, 0);

        assert.strictEqual(result.lines[1], '`SCHEDULED: <2026-09-04 Пт>`');
    });

    test('a day the entry already stands on rewrites nothing', () => {
        const result = plan(ENTRY, { date: '2026-09-01', planning: 'scheduled' });

        assert.deepStrictEqual(result.changed, []);
        assert.deepStrictEqual(result.lines, [...ENTRY]);
    });

    test('a planning line the entry did not have goes under the closing mark too', () => {
        const closed = [
            '## DONE купить хлеб',
            '    `CREATED: [2026-08-31 пн 14:01]`',
            '    `CLOSED: [2026-09-01 вт 09:12]`',
            'текст'
        ];

        const result = plan(closed, { date: '2026-09-04', planning: 'deadline' }, 0);

        assert.strictEqual(result.lines[3], '    `DEADLINE: <2026-09-04 Пт>`');
        assert.strictEqual(result.lines[4], 'текст');
    });

    test('a date said without naming a line joins the deadline the entry already keeps', () => {
        const deadlined = ['## TODO купить хлеб', '`DEADLINE: <2026-09-01 Вт>`', 'текст'];

        const result = plan(deadlined, { date: '2026-09-04' }, 0);

        assert.deepStrictEqual(result.changed, ['date']);
        assert.strictEqual(result.lines[1], '`DEADLINE: <2026-09-04 Пт>`');
    });

    test('a planning line whose timestamp cannot be read is written afresh', () => {
        // The line matches what a planning line looks like, and what stands
        // inside the brackets is not a date. The phrase names one, so the line
        // is written from the phrase alone rather than refused.
        const broken = ['## TODO купить хлеб', '`SCHEDULED: <не дата>`', 'текст'];

        const result = plan(broken, { date: '2026-09-04', planning: 'scheduled' }, 0);

        assert.deepStrictEqual(result.changed, ['date']);
        assert.strictEqual(result.lines[1], '`SCHEDULED: <2026-09-04 Пт>`');
    });

    test('two fields in one phrase are both written and both named', () => {
        const result = plan(ENTRY, { keyword: 'DONE', date: '2026-09-04', planning: 'scheduled' });

        assert.deepStrictEqual(result.changed, ['keyword', 'date']);
        assert.strictEqual(result.lines[2], '## DONE [#B] позвонить врачу');
        assert.strictEqual(result.lines[4], '    `SCHEDULED: <2026-09-04 Пт 15:00 +1w>`');
    });
});
