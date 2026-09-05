import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    OccurrenceError,
    cancelOccurrence,
    listOccurrences,
    moveOccurrence,
    replacementOf,
    seriesWeekday
} from '../../utils/occurrenceEdit';

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
    test('is a MOVED line of the series, under its planning line', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), '18:00');

        assert.strictEqual(edit.changed, true);
        assert.deepStrictEqual(edit.lines, [
            '# TODO English',
            '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
            '    `MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`',
            '```org-properties',
            'ID: 9f2c',
            '```',
            ''
        ]);
    });

    test('leaves the series repeating, with no EXDATE and no second entry', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), null);

        assert.ok(edit.lines.includes('    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`'));
        assert.ok(!edit.lines.some((line) => line.startsWith('EXDATE')));
        assert.strictEqual(edit.lines.filter((line) => line.startsWith('# TODO English')).length, 1);
    });

    test('keeps the hour of the series when none is asked for', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), null);

        assert.ok(edit.lines.includes('    `MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 15:00>`'));
    });

    test('needs no identifier on the series, and gives it none', () => {
        // What `SERIES_ID` pointed at was an entry elsewhere; a line inside
        // the entry points at nothing and needs no name for it.
        const nameless = ['# TODO English', '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''];

        const edit = moveOccurrence(nameless, 0, on('2026-08-20'), on('2026-08-22'), null);

        assert.ok(edit.lines.includes('    `MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 15:00>`'));
        assert.ok(!edit.lines.some((line) => line.startsWith('ID:')), 'no identifier is invented');
    });

    test('moved a second time, rewrites its line rather than writing another', () => {
        const once = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), null);

        const twice = moveOccurrence(once.lines, 0, on('2026-08-20'), on('2026-08-25'), null);

        assert.strictEqual(twice.changed, true);
        assert.ok(twice.lines.includes('    `MOVED: [2026-08-20 Thu] -> <2026-08-25 Tue 15:00>`'));
        assert.strictEqual(
            twice.lines.filter((line) => line.includes('MOVED: [2026-08-20')).length,
            1,
            'the occurrence is moved by one line'
        );
        assert.strictEqual(twice.lines.length, once.lines.length);
    });

    test('moved a second time, takes the hour asked for and keeps the one it had otherwise', () => {
        const once = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), '18:00');

        const hour = moveOccurrence(once.lines, 0, on('2026-08-20'), on('2026-08-25'), '09:30');
        const kept = moveOccurrence(once.lines, 0, on('2026-08-20'), on('2026-08-25'), null);

        assert.ok(hour.lines.includes('    `MOVED: [2026-08-20 Thu] -> <2026-08-25 Tue 09:30>`'));
        assert.ok(
            kept.lines.includes('    `MOVED: [2026-08-20 Thu] -> <2026-08-25 Tue 15:00>`'),
            'with no hour asked for, the hour of the series stands'
        );
    });

    test('moved back to where it already stands, changes nothing', () => {
        const once = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), '18:00');

        const again = moveOccurrence(once.lines, 0, on('2026-08-20'), on('2026-08-22'), '18:00');

        assert.strictEqual(again.changed, false);
        assert.deepStrictEqual(again.lines, once.lines);
    });

    test('moves a second occurrence with a line of its own', () => {
        const once = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), null);

        const twice = moveOccurrence(once.lines, 0, on('2026-08-27'), on('2026-08-29'), null);

        assert.deepStrictEqual(twice.lines.slice(1, 4), [
            '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
            '    `MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 15:00>`',
            '    `MOVED: [2026-08-27 Thu] -> <2026-08-29 Sat 15:00>`'
        ]);
    });

    test('is spelled the way the series is', () => {
        // A file written in Russian keeps its Russian weekdays.
        const russian = ['# TODO Занятие', '`DEADLINE: <2026-08-06 чт 15:00 +1w -2d>`', ''];

        const edit = moveOccurrence(russian, 0, on('2026-08-06'), on('2026-08-08'), null);

        assert.ok(edit.lines.includes('`MOVED: [2026-08-06 чт] -> <2026-08-08 сб 15:00>`'));
    });

    test('names no hour where the series has none, and takes one that is asked for', () => {
        const allDay = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu +1w>`', ''];

        assert.ok(
            moveOccurrence(allDay, 0, on('2026-08-06'), on('2026-08-08'), null).lines.includes(
                '`MOVED: [2026-08-06 Thu] -> <2026-08-08 Sat>`'
            )
        );
        assert.ok(
            moveOccurrence(allDay, 0, on('2026-08-06'), on('2026-08-08'), '09:30').lines.includes(
                '`MOVED: [2026-08-06 Thu] -> <2026-08-08 Sat 09:30>`'
            )
        );
    });

    test('an occurrence held between two times keeps both of them', () => {
        // An hour and a half on Thursday is an hour and a half on Saturday:
        // the range says how long the occurrence is, not only when it starts.
        const ranged = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00-16:30 +1w>`', ''];

        const edit = moveOccurrence(ranged, 0, on('2026-08-06'), on('2026-08-08'), null);

        assert.ok(edit.lines.includes('`MOVED: [2026-08-06 Thu] -> <2026-08-08 Sat 15:00-16:30>`'));
    });

    test('the range is read back, so moving it again does not lose the hour it ends at', () => {
        const ranged = [
            '# TODO English',
            '`SCHEDULED: <2026-08-06 Thu 15:00-16:30 +1w>`',
            '`MOVED: [2026-08-06 Thu] -> <2026-08-08 Sat 15:00-16:30>`',
            ''
        ];

        const standing = replacementOf(ranged, 0, on('2026-08-06'));

        assert.ok(standing);
        assert.equal(standing.time, '15:00-16:30');
    });

    test('is refused where two planning lines repeat at once', () => {
        const both = [
            '# TODO English',
            '    `SCHEDULED: <2026-08-06 Thu 15:00 +1w>`',
            '    `DEADLINE: <2026-08-07 Fri +1w>`'
        ];

        assert.throws(() => moveOccurrence(both, 0, on('2026-08-06'), on('2026-08-08'), null), OccurrenceError);
    });

    /**
     * An occurrence moved before the format changed stands in an entry of its
     * own, which the core still reads. Moving it again rewrites that entry: a
     * `MOVED` line here would speak for the same day, and the file would draw
     * the occurrence twice.
     */
    test('moved again where an older entry stands in for it, rewrites that entry', () => {
        const older = [
            ...SERIES,
            '# TODO English',
            '`SCHEDULED: <2026-08-22 Sat 18:00>`',
            '```org-properties',
            'SERIES_ID: 9f2c',
            'RECURRENCE_ID: 2026-08-20 15:00',
            '```'
        ];

        const edit = moveOccurrence(older, 0, on('2026-08-20'), on('2026-08-25'), null);

        assert.ok(edit.lines.includes('`SCHEDULED: <2026-08-25 Tue 18:00>`'), 'the older entry moved');
        assert.ok(!edit.lines.some((line) => line.includes('MOVED: [2026-08-20')), 'and no line was added');
        assert.strictEqual(edit.lines.length, older.length);
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
        const edit = moveOccurrence(THEIRS, 0, on('2026-08-20'), on('2026-08-20'), '18:00');

        assert.strictEqual(
            edit.lines.join('\n'),
            '# TODO English\n' +
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`\n' +
                '`MOVED: [2026-08-20 Thu] -> <2026-08-20 Thu 18:00>`\n'
        );
    });

    /** The line joins the entry it belongs to, whatever level that entry is at. */
    test('the move is written under the series, however deep the heading is', () => {
        const deep = ['### TODO [#A] English', '`SCHEDULED: <2026-08-14 Fri +1w>`', ''];

        const edit = moveOccurrence(deep, 0, on('2026-08-21'), on('2026-08-28'), null);

        assert.strictEqual(
            edit.lines.join('\n'),
            '### TODO [#A] English\n' +
                '`SCHEDULED: <2026-08-14 Fri +1w>`\n' +
                '`MOVED: [2026-08-21 Fri] -> <2026-08-28 Fri>`\n'
        );
    });

    /** A working-day repeater moves like any other: one occurrence, one line. */
    test('a working-day series is moved the same way', () => {
        const workdays = ['# TODO Standup', '`SCHEDULED: <2026-08-06 Thu 10:00 +1wd>`', ''];

        const edit = moveOccurrence(workdays, 0, on('2026-08-06'), on('2026-08-07'), null);

        assert.ok(edit.lines.includes('`MOVED: [2026-08-06 Thu] -> <2026-08-07 Fri 10:00>`'));
    });
});

/**
 * The entry as it is actually written, rather than as the first tests wrote
 * it: a creation stamp above the planning line, a property block below, and
 * -- in the last of them -- a line the format does not name at all.
 *
 * These are the shapes the operation refused on. The planning line was looked
 * for only in the run of lines directly under the heading, so the first line
 * that was not a timestamp ended the search, and an entry repeating in plain
 * sight was reported as one that does not repeat.
 */
suite('the planning line, in an entry that is not only a planning line', () => {
    /** The occurrence being moved is picked by the caller, so any day of the series will do. */
    const DAY = on('2026-08-20');

    test('is found under a creation stamp', () => {
        const entry = [
            '## English',
            '`CREATED: [2025-12-08 Mon 01:06]`',
            '`SCHEDULED: <2025-12-08 Mon 15:00 +1w>`',
            ''
        ];

        const edit = moveOccurrence(entry, 0, DAY, on('2026-08-22'), null);

        assert.match(edit.lines.join('\n'), /`MOVED: \[2026-08-20 Thu\] -> <2026-08-22 Sat 15:00>`/);
    });

    test('is found under a property block', () => {
        const entry = [
            '## English',
            '```org-properties',
            'GCAL_EVENT_ID: cfdc2b9f',
            '```',
            '`SCHEDULED: <2025-12-08 Mon 15:00 +1w>`',
            ''
        ];

        const edit = moveOccurrence(entry, 0, DAY, on('2026-08-22'), null);

        assert.match(edit.lines.join('\n'), /`MOVED: \[2026-08-20 Thu\] -> <2026-08-22 Sat 15:00>`/);
    });

    test('is found past a keyword written without its colon', () => {
        // The line the reader typed by hand. It is not a planning line to
        // either client, and it used to hide the one below it.
        const entry = [
            '## English',
            '`SCHEDULED <2025-12-01 Mon 15:00 +1w>`',
            '`SCHEDULED: <2025-12-08 Mon 15:00 +1w>`',
            ''
        ];

        const edit = moveOccurrence(entry, 0, DAY, on('2026-08-22'), null);

        assert.match(edit.lines.join('\n'), /`MOVED: \[2026-08-20 Thu\] -> <2026-08-22 Sat 15:00>`/);
    });

    test('is not looked for past the end of the entry', () => {
        const entry = [
            '## English',
            '`CREATED: [2025-12-08 Mon 01:06]`',
            '',
            '## German',
            '`SCHEDULED: <2025-12-09 Tue 15:00 +1w>`',
            ''
        ];

        assert.throws(
            () => moveOccurrence(entry, 0, DAY, on('2026-08-22'), null),
            (error: unknown) => error instanceof OccurrenceError && error.message.includes('carries no planning line')
        );
    });

    test('an entry with a planning line that does not repeat is told apart from one with none', () => {
        const once = ['## English', '`SCHEDULED: <2026-08-06 Thu 15:00>`', ''];
        const none = ['## English', '`CREATED: [2025-12-08 Mon 01:06]`', ''];

        assert.throws(
            () => moveOccurrence(once, 0, DAY, on('2026-08-22'), null),
            (error: unknown) => error instanceof OccurrenceError && error.message.includes('does not repeat')
        );
        assert.throws(
            () => moveOccurrence(none, 0, DAY, on('2026-08-22'), null),
            (error: unknown) => error instanceof OccurrenceError && error.message.includes('carries no planning line')
        );
    });
});

/**
 * The days offered instead of a date to type.
 *
 * What the reader means by "that class" is the next one, or the one after
 * it -- not a date they work out from a repeater. The listing is what the
 * picker shows, so it counts from the series' own date and says which of the
 * days ahead the file has already lost.
 */
suite('the days a series falls on', () => {
    const WEEKLY = ['## English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''];

    test('are counted from the series date, at the hour it is held', () => {
        const ahead = listOccurrences(WEEKLY, 0, 'English', on('2026-08-06'), 3);

        assert.deepStrictEqual(
            ahead.map((day) => `${day.day} ${day.time}`),
            ['2026-08-06 15:00', '2026-08-13 15:00', '2026-08-20 15:00']
        );
    });

    test('begin at the day asked for, not at the series date', () => {
        const ahead = listOccurrences(WEEKLY, 0, 'English', on('2026-09-01'), 2);

        assert.deepStrictEqual(
            ahead.map((day) => day.day),
            ['2026-09-03', '2026-09-10']
        );
    });

    test('say which days the series has already lost', () => {
        const cancelled = cancelOccurrence(WEEKLY, 0, 'English', on('2026-08-13'));
        const moved = moveOccurrence(cancelled.lines, 0, on('2026-08-20'), on('2026-08-22'), null);

        const ahead = listOccurrences(moved.lines, 0, 'English', on('2026-08-06'), 3);

        assert.deepStrictEqual(
            ahead.map((day) => `${day.day} ${day.cancelled ? 'cancelled' : ''}${day.moved ? 'moved' : ''}`.trim()),
            ['2026-08-06', '2026-08-13 cancelled', '2026-08-20 moved']
        );
    });

    test('follow a monthly repeater by month, not by thirty days', () => {
        const monthly = ['## Rent', '`SCHEDULED: <2026-01-31 Sat +1m>`', ''];

        const ahead = listOccurrences(monthly, 0, 'Rent', on('2026-01-31'), 3);

        assert.deepStrictEqual(
            ahead.map((day) => day.day),
            ['2026-01-31', '2026-02-28', '2026-03-28']
        );
    });

    test('are refused for a repeater counted in working days', () => {
        const workdays = ['## Standup', '`SCHEDULED: <2026-08-06 Thu 09:00 +1wd>`', ''];

        assert.throws(
            () => listOccurrences(workdays, 0, 'Standup', on('2026-08-06'), 3),
            (error: unknown) => error instanceof OccurrenceError && error.message.includes('working days')
        );
    });

    test('carry the weekday the file spells them with', () => {
        const russian = ['## Английский', '`SCHEDULED: <2026-08-06 Чт 15:00 +1w>`', ''];

        assert.strictEqual(seriesWeekday(russian, 0, 'Английский'), 'Чт');
        assert.strictEqual(seriesWeekday(WEEKLY, 0, 'English'), 'Thu');
    });

    test('an entry without a weekday is listed without one', () => {
        const bare = ['## English', '`<2026-08-06 15:00 +1w>`', ''];

        assert.strictEqual(seriesWeekday(bare, 0, 'English'), null);
        assert.deepStrictEqual(
            listOccurrences(bare, 0, 'English', on('2026-08-06'), 2).map((day) => day.day),
            ['2026-08-06', '2026-08-13']
        );
    });
});

suite('where an occurrence already stands', () => {
    test('is nothing for a day the series still draws itself', () => {
        assert.strictEqual(replacementOf(SERIES, 0, on('2026-08-20')), null);
    });

    test('is the day and hour the replacement was written with', () => {
        const edit = moveOccurrence(SERIES, 0, on('2026-08-20'), on('2026-08-22'), '18:00');

        const standing = replacementOf(edit.lines, 0, on('2026-08-20'));

        assert.ok(standing, 'the replacement was not found');
        assert.strictEqual(standing.day, '2026-08-22');
        assert.strictEqual(standing.time, '18:00');
    });

    test('is nothing for a series that carries no identifier', () => {
        const nameless = ['# TODO English', '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`', ''];

        assert.strictEqual(replacementOf(nameless, 0, on('2026-08-20')), null);
    });

    test('is the day an older entry standing in for it carries', () => {
        // The shape written before the format changed, which the core still
        // reads and the command still has to answer from.
        const older = [
            ...SERIES,
            '# TODO English',
            '`SCHEDULED: <2026-08-22 Sat 18:00>`',
            '```org-properties',
            'SERIES_ID: 9f2c',
            'RECURRENCE_ID: 2026-08-20 15:00',
            '```'
        ];

        const standing = replacementOf(older, 0, on('2026-08-20'));

        assert.strictEqual(standing?.day, '2026-08-22');
        assert.strictEqual(standing.time, '18:00');
    });

    test('is nothing for an older entry standing in for another series', () => {
        const theirs = [
            ...SERIES,
            '# TODO English',
            '`SCHEDULED: <2026-08-22 Sat 18:00>`',
            '```org-properties',
            'SERIES_ID: 4a11',
            'RECURRENCE_ID: 2026-08-20 15:00',
            '```'
        ];

        assert.strictEqual(replacementOf(theirs, 0, on('2026-08-20')), null);
    });
});
