import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { OccurrenceError, cancelOccurrence, moveOccurrence } from '../../utils/occurrenceEdit';

/** A weekly series with an hour, a property block and an identifier of its own. */
const SERIES = [
    '# TODO English',
    '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
    '```org-properties',
    'ID: 9f2c',
    '```',
    ''
];

/** A date in local time, which is the only time these files are written in. */
function on(text: string): Date {
    const [year, month, day] = text.split('-').map((part) => parseInt(part, 10));
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

suite('an occurrence that is gone', () => {
    test('joins the EXDATE of the series it is taken out of', () => {
        const edit = cancelOccurrence(SERIES, 0, 'English', on('2026-08-13'));

        assert.strictEqual(edit.changed, true);
        assert.deepStrictEqual(edit.lines.slice(2, 5), ['```org-properties', 'ID: 9f2c', 'EXDATE: 2026-08-13']);
    });

    test('is written once, however often it is asked for', () => {
        const first = cancelOccurrence(SERIES, 0, 'English', on('2026-08-13'));
        const again = cancelOccurrence(first.lines, 0, 'English', on('2026-08-13'));

        assert.strictEqual(again.changed, false);
        assert.deepStrictEqual(again.lines, first.lines);
    });

    test('joins the dates already listed rather than replacing them', () => {
        const first = cancelOccurrence(SERIES, 0, 'English', on('2026-08-13'));
        const second = cancelOccurrence(first.lines, 0, 'English', on('2026-08-20'));

        assert.ok(second.lines.includes('EXDATE: 2026-08-13, 2026-08-20'));
    });

    test('opens a property block for a series that has none', () => {
        const bare = ['# TODO English', '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', 'A note.'];

        const edit = cancelOccurrence(bare, 0, 'English', on('2026-08-13'));

        assert.deepStrictEqual(edit.lines, [
            '# TODO English',
            '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
            '```org-properties',
            'EXDATE: 2026-08-13',
            '```',
            'A note.'
        ]);
    });

    test('is refused for an entry that does not repeat', () => {
        const once = ['# TODO English', '    `SCHEDULED: <2026-08-06 Thu 15:00>`'];

        assert.throws(() => cancelOccurrence(once, 0, 'English', on('2026-08-06')), OccurrenceError);
    });
});

suite('an occurrence that moved', () => {
    test('is an entry of its own at the end of the file, naming what it replaces', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), '18:00', 'unused');

        assert.deepStrictEqual(edit.lines.slice(-6), [
            '# TODO English',
            '    `SCHEDULED: <2026-08-22 Sat 18:00>`',
            '```org-properties',
            'SERIES_ID: 9f2c',
            'RECURRENCE_ID: 2026-08-20 15:00',
            '```'
        ]);
    });

    test('leaves the series repeating, with no EXDATE beside it', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), null, 'unused');

        assert.deepStrictEqual(edit.lines.slice(0, 5), SERIES.slice(0, 5));
        assert.ok(!edit.lines.some((line) => line.startsWith('EXDATE')));
    });

    test('keeps the hour of the series when none is asked for', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), null, 'unused');

        assert.ok(edit.lines.includes('    `SCHEDULED: <2026-08-22 Sat 15:00>`'));
    });

    test('names the series it replaces an occurrence of, giving it an identifier when it has none', () => {
        const nameless = ['# TODO English', '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''];

        const edit = moveOccurrence(nameless, 0, on('2026-08-20'), on('2026-08-22'), null, '5b17');

        assert.ok(edit.lines.includes('ID: 5b17'), 'the series is given the identifier');
        assert.ok(edit.lines.includes('SERIES_ID: 5b17'), 'the replacement names it');
    });

    test('is refused where an entry of the file already replaces that day', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), null, 'unused');

        assert.throws(
            () => moveOccurrence(edit.lines, 0, on('2026-08-20'), on('2026-08-25'), null, 'unused'),
            OccurrenceError
        );
    });

    test('is refused where two planning lines repeat at once', () => {
        const both = [
            '# TODO English',
            '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
            '    `DEADLINE: <2026-08-07 Fri +1w>`'
        ];

        assert.throws(() => moveOccurrence(both, 0, on('2026-08-06'), on('2026-08-08'), null, 'x'), OccurrenceError);
    });

    /**
     * The replacement is the series' own line rewritten, so a file written in
     * Russian keeps its Russian weekdays and a deadline keeps the window it is
     * warned about; only the repeater goes, because one occurrence does not
     * repeat.
     */
    test('is spelled the way the series is', () => {
        const russian = ['# TODO Занятие', '`DEADLINE: <2026-08-06 чт 15:00 +1w -2d>`', ''];

        const edit = moveOccurrence(russian, 0, on('2026-08-06'), on('2026-08-08'), null, 'x');

        assert.ok(edit.lines.includes('`DEADLINE: <2026-08-08 сб 15:00 -2d>`'));
    });

    test('writes a time into a timestamp that carried none', () => {
        const allDay = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu +1w>`', ''];

        const edit = moveOccurrence(allDay, 0, on('2026-08-06'), on('2026-08-08'), '09:30', 'x');

        assert.ok(edit.lines.includes('`SCHEDULED: <2026-08-08 Sat 09:30>`'));
        assert.ok(edit.lines.includes('RECURRENCE_ID: 2026-08-06'), 'a series with no hour names the day alone');
    });

    /**
     * A range of times names one occurrence by where it starts, which is what a
     * recurrence identifier is -- and the extractor reads such a timestamp, so
     * a series written with one has to be movable.
     */
    test('names an occurrence held between two times by the time it starts', () => {
        const ranged = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00-16:30 +1w>`', ''];

        const edit = moveOccurrence(ranged, 0, on('2026-08-06'), on('2026-08-08'), null, 'x');

        assert.ok(edit.lines.includes('RECURRENCE_ID: 2026-08-06 15:00'));
        assert.ok(edit.lines.includes('`SCHEDULED: <2026-08-08 Sat 15:00-16:30>`'), 'the range moves as it stands');
    });
});

/**
 * The same two operations run in the Android client, over the same notes, and
 * a file written differently by the two is a file that reads differently on
 * the phone. These are the files its own tests spell out
 * (`rust/markdown-org-ffi/tests/occurrence.rs`), copied here verbatim: a change
 * on either side that parts the two shows up as a failure rather than as a
 * conflict in somebody's notes.
 */
suite('the file the other client writes', () => {
    /** The series those tests are written against, with no property block of its own. */
    const THEIRS = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''];

    test('a cancelled occurrence lands the same way', () => {
        const edit = cancelOccurrence(THEIRS, 0, 'English', on('2026-08-20'));

        assert.strictEqual(
            edit.lines.join('\n'),
            '# TODO English\n' +
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`\n' +
                '```org-properties\n' +
                'EXDATE: 2026-08-20\n' +
                '```\n'
        );
    });

    test('a second cancelled occurrence joins the list the same way', () => {
        const first = cancelOccurrence(THEIRS, 0, 'English', on('2026-08-20'));
        const second = cancelOccurrence(first.lines, 0, 'English', on('2026-08-27'));

        assert.strictEqual(
            second.lines.join('\n'),
            '# TODO English\n' +
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`\n' +
                '```org-properties\n' +
                'EXDATE: 2026-08-20, 2026-08-27\n' +
                '```\n'
        );
    });

    test('a moved occurrence lands the same way', () => {
        const edit = moveOccurrence(THEIRS, 0, on('2026-08-20'), on('2026-08-20'), '18:00', '9f2c');

        assert.strictEqual(
            edit.lines.join('\n'),
            '# TODO English\n' +
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`\n' +
                '```org-properties\n' +
                'ID: 9f2c\n' +
                '```\n' +
                '\n' +
                '# TODO English\n' +
                '`SCHEDULED: <2026-08-20 Thu 18:00>`\n' +
                '```org-properties\n' +
                'SERIES_ID: 9f2c\n' +
                'RECURRENCE_ID: 2026-08-20 15:00\n' +
                '```'
        );
    });

    /** A priority and a heading level are copied as they stand. */
    test('the replacement carries the heading the series is written with', () => {
        const deep = ['### TODO [#A] English', '`SCHEDULED: <2026-08-14 Fri +1w>`', ''];

        const edit = moveOccurrence(deep, 0, on('2026-08-21'), on('2026-08-21'), null, 'x');

        assert.ok(edit.lines.join('\n').includes('### TODO [#A] English\n`SCHEDULED: <2026-08-21 Fri>`\n'));
    });

    /** A working-day repeater goes as well: one occurrence does not repeat, whatever the unit. */
    test('a working-day series leaves its repeater behind too', () => {
        const workdays = ['# TODO Standup', '`SCHEDULED: <2026-08-06 Thu 10:00 +1wd>`', ''];

        const edit = moveOccurrence(workdays, 0, on('2026-08-06'), on('2026-08-07'), null, 'x');

        assert.ok(edit.lines.includes('`SCHEDULED: <2026-08-07 Fri 10:00>`'));
    });
});
