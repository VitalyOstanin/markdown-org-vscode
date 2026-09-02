import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { describePhraseFields, parsePhraseFields, phraseEntryLines } from '../../utils/phraseEntry';
import type { PhraseEntryOptions, PhraseFields } from '../../utils/phraseEntry';

const RU_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** The moment the command opened, which the mark under the heading carries. */
const WRITTEN = new Date(2026, 7, 31, 14, 1);

const OPTIONS: PhraseEntryOptions = { hashes: '##', indent: '    ', weekdays: RU_DAYS, written: WRITTEN };

/** What the extractor prints, with only the named fields set. */
function fields(overrides: Partial<PhraseFields> = {}): PhraseFields {
    return { currentDate: '2026-08-31', heading: 'позвонить врачу', cleared: [], ...overrides };
}

suite('parsePhraseFields', () => {
    test('reads the object the extractor prints', () => {
        const parsed = parsePhraseFields(
            '{"current_date":"2026-08-31","heading":"позвонить врачу","priority":"A",' +
                '"planning":"scheduled","date":"2026-09-01","time":"15:00","repeater":"+1w"}'
        );

        assert.deepStrictEqual(parsed, {
            currentDate: '2026-08-31',
            heading: 'позвонить врачу',
            priority: 'A',
            planning: 'scheduled',
            date: '2026-09-01',
            time: '15:00',
            repeater: '+1w',
            keyword: undefined,
            cleared: []
        });
    });

    test('a null field is absent rather than empty', () => {
        // The difference matters one line down: an empty string would write a
        // planning line with nothing in the timestamp.
        const parsed = parsePhraseFields(
            '{"current_date":"2026-08-31","heading":"купить хлеб","priority":null,' +
                '"planning":null,"date":null,"time":null,"repeater":null}'
        );

        assert.strictEqual(parsed.date, undefined);
        assert.strictEqual(parsed.priority, undefined);
        assert.strictEqual(parsed.planning, undefined);
    });

    test('an answer without a heading is refused', () => {
        // A future binary that renames the field must fail here rather than
        // write an entry with an empty heading and no way to tell why.
        assert.throws(() => parsePhraseFields('{"current_date":"2026-08-31"}'), /heading/);
    });

    test('reads the keyword and the emptied fields of an edit', () => {
        const parsed = parsePhraseFields(
            '{"current_date":"2026-08-31","heading":"","keyword":"DONE","priority":null,' +
                '"planning":null,"date":null,"time":null,"repeater":null,"cleared":["repeater"]}'
        );

        assert.strictEqual(parsed.keyword, 'DONE');
        assert.deepStrictEqual(parsed.cleared, ['repeater']);
    });

    test('a keyword outside the four a heading can carry is refused', () => {
        assert.throws(
            () => parsePhraseFields('{"current_date":"2026-08-31","heading":"x","keyword":"LATER"}'),
            /keyword/
        );
    });

    test('cleared that is not an array of names is refused', () => {
        assert.throws(
            () => parsePhraseFields('{"current_date":"2026-08-31","heading":"x","cleared":"date"}'),
            /cleared/
        );
    });

    test('a planning value outside the two keywords is refused', () => {
        assert.throws(
            () => parsePhraseFields('{"current_date":"2026-08-31","heading":"x","planning":"someday"}'),
            /planning/
        );
    });

    test('output that is not an object is refused', () => {
        assert.throws(() => parsePhraseFields('"nothing"'), /JSON object/);
    });
});

suite('phraseEntryLines', () => {
    test('a day, an hour and a repeater become the planning line', () => {
        const lines = phraseEntryLines(
            fields({ priority: 'A', planning: 'scheduled', date: '2026-09-01', time: '15:00', repeater: '+1w' }),
            OPTIONS
        );

        assert.deepStrictEqual(lines, [
            '## TODO [#A] позвонить врачу',
            '    `CREATED: [2026-08-31 пн 14:01]`',
            '    `SCHEDULED: <2026-09-01 вт 15:00 +1w>`'
        ]);
    });

    test('a deadline is written on its own keyword', () => {
        const lines = phraseEntryLines(fields({ planning: 'deadline', date: '2026-09-04' }), OPTIONS);

        assert.strictEqual(lines[2], '    `DEADLINE: <2026-09-04 пт>`');
    });

    test('a day without an hour is a date-only timestamp', () => {
        // The hour is not invented: a task said for Friday is due that day,
        // not at midnight, and 00:00 would put it at the top of the timeline.
        const lines = phraseEntryLines(fields({ planning: 'scheduled', date: '2026-09-15' }), OPTIONS);

        assert.strictEqual(lines[2], '    `SCHEDULED: <2026-09-15 вт>`');
    });

    test('a phrase that named no date at all is a heading and the day it was written on', () => {
        const lines = phraseEntryLines(fields({ heading: 'купить хлеб' }), OPTIONS);

        assert.deepStrictEqual(lines, ['## TODO купить хлеб', '    `CREATED: [2026-08-31 пн 14:01]`']);
    });

    test('the moment it was written at is the one the command opened at', () => {
        // Handed in rather than read off the clock here: a box left open over
        // midnight would otherwise mark a moment no phrase was read against,
        // and the phone is handed the same moment for the same reason.
        const lines = phraseEntryLines(fields({ date: '2026-09-04' }), {
            ...OPTIONS,
            written: new Date(2026, 8, 1, 9, 7)
        });

        assert.strictEqual(lines[1], '    `CREATED: [2026-09-01 вт 09:07]`');
    });

    test('the mark carries the minute and is written in the inactive brackets', () => {
        // Inactive, as org-mode's expiry convention has it: the entry was
        // created at that moment, it is not held at it, so no agenda shows the
        // mark. To the minute, which is what tells two entries of one day
        // apart.
        const lines = phraseEntryLines(fields({ time: '15:00' }), OPTIONS);

        assert.strictEqual(lines[1], '    `CREATED: [2026-08-31 пн 14:01]`');
    });

    test('an hour with no day of its own lands on the day the phrase was read against', () => {
        // "позвонить в 15:00" is today at three: an org timestamp has no way
        // to carry an hour without a date under it.
        const lines = phraseEntryLines(fields({ time: '15:00' }), OPTIONS);

        assert.strictEqual(lines[2], '    `SCHEDULED: <2026-08-31 пн 15:00>`');
    });

    test('a repeater with no day of its own does the same', () => {
        const lines = phraseEntryLines(fields({ heading: 'зарядка', repeater: '+1d' }), OPTIONS);

        assert.strictEqual(lines[2], '    `SCHEDULED: <2026-08-31 пн +1d>`');
    });

    test('a day said without a keyword is scheduled, not a deadline', () => {
        const lines = phraseEntryLines(fields({ date: '2026-09-01' }), OPTIONS);

        assert.match(lines[2] ?? '', /SCHEDULED/);
    });

    test('the level and the indent are the placement it was given', () => {
        const lines = phraseEntryLines(fields({ date: '2026-09-01' }), {
            hashes: '####',
            indent: '  ',
            weekdays: RU_DAYS,
            written: WRITTEN
        });

        assert.strictEqual(lines[0], '#### TODO позвонить врачу');
        assert.strictEqual(lines[1], '  `CREATED: [2026-08-31 пн 14:01]`');
        assert.strictEqual(lines[2], '  `SCHEDULED: <2026-09-01 вт>`');
    });

    test('the weekday follows the names it was handed', () => {
        const lines = phraseEntryLines(fields({ date: '2026-09-01' }), {
            ...OPTIONS,
            weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        });

        assert.strictEqual(lines[1], '    `CREATED: [2026-08-31 Mon 14:01]`');
        assert.strictEqual(lines[2], '    `SCHEDULED: <2026-09-01 Tue>`');
    });
});

suite('describePhraseFields', () => {
    test('the lines stand in one line, without their indent', () => {
        const description = describePhraseFields(
            fields({ planning: 'scheduled', date: '2026-09-01', time: '15:00' }),
            OPTIONS
        );

        assert.strictEqual(description, '## TODO позвонить врачу  `SCHEDULED: <2026-09-01 вт 15:00>`');
    });

    test('a heading alone describes itself', () => {
        assert.strictEqual(describePhraseFields(fields({ heading: 'купить хлеб' }), OPTIONS), '## TODO купить хлеб');
    });

    test('the creation mark is left out of the description', () => {
        // It says today whatever the phrase said, so a line of it in the title
        // of the box would take room from what is being corrected.
        const description = describePhraseFields(fields({ date: '2026-09-01' }), OPTIONS);

        assert.ok(!description.includes('CREATED'), description);
    });
});
