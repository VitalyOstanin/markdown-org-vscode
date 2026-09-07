import * as assert from 'node:assert/strict';
import { validateMovedLines } from '../../diagnostics/movedPolicy';
import type { MovedViolation } from '../../diagnostics/movedPolicy';

const SERIES = '# TODO English';
const PLANNING = '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`';

/** The one violation a document of a series and one MOVED line produces. */
function only(moved: string): MovedViolation {
    const found = validateMovedLines([SERIES, PLANNING, moved]);
    assert.equal(found.length, 1, `expected one violation, got ${JSON.stringify(found)}`);
    const violation = found[0];
    assert.ok(violation);
    return violation;
}

/** The text the quick fix leaves in place of what it underlined. */
function fixed(moved: string): string {
    const violation = only(moved);
    const { replacement } = violation;
    assert.ok(replacement !== null, 'the violation offers no fix');
    return moved.slice(0, violation.startCharacter) + replacement + moved.slice(violation.endCharacter);
}

suite('movedPolicy', () => {
    test('a line written the way the extension writes it says nothing', () => {
        assert.deepEqual(
            validateMovedLines([SERIES, PLANNING, '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`']),
            []
        );
    });

    test('the spacing the extractor reads past says nothing here either', () => {
        // The extractor trims the value after the keyword and either half of
        // the arrow, and its timestamps hold any whitespace between fields. A
        // line it reads as a move must not be reported as a fault -- and it
        // must be found by the reader that writes moves, or the two disagree
        // about the same line.
        for (const line of [
            '`MOVED:  [2026-08-20 Thu]  ->  <2026-08-22 Sat 18:00>`  ',
            '`MOVED:[2026-08-20 Thu]-><2026-08-22 Sat 18:00>`',
            '`MOVED: [2026-08-20\u00a0Thu] -> <2026-08-22\u00a0Sat 18:00>`'
        ]) {
            assert.deepEqual(validateMovedLines([SERIES, PLANNING, line]), [], line);
        }
    });

    test('a planning line spaced with a no-break space still names the weekday a fix is spelt from', () => {
        // The entry's own line is read with the same treatment of whitespace.
        // Read strictly it named no weekday, and the fix fell back to the
        // first weekday anywhere in the file -- the English entry above,
        // which answers a Russian entry with `Thu`.
        const found = validateMovedLines([
            '# TODO Lesson',
            '`SCHEDULED: <2026-08-03 Mon 10:00 +1w>`',
            '# TODO Английский',
            '`SCHEDULED: <2026-08-06\u00a0чт 15:00 +1w>`',
            '`MOVED: 2026-08-20 -> <2026-08-22 18:00>`'
        ]);

        assert.equal(found.length, 1);
        assert.equal(found[0]?.kind, 'occurrence-bare');
        // `assert.equal` narrows what it compares, so the element is known here.
        assert.equal(found[0].replacement, '[2026-08-20 чт]');
    });

    test('an occurrence the series does not fall on is reported', () => {
        // The series is Thursdays and the 19th is a Wednesday. Read as a move
        // of a day the entry never had, the line gives the series an extra
        // day -- and adding an occurrence is an operation this format does
        // not have, so the extractor refuses the line (its ADR-0040).
        const line = '`MOVED: [2026-08-19 Wed] -> <2026-08-27 Thu 18:00>`';
        const violation = only(line);

        assert.equal(violation.kind, 'occurrence-not-of-the-series');
        assert.equal(violation.replacement, null, 'which day was meant cannot be guessed');
    });

    test('an occurrence before the series begins is reported', () => {
        // A Thursday all the same, and still not an occurrence: the series
        // starts on 2026-08-06 and has nothing behind it.
        assert.equal(only('`MOVED: [2026-07-30 Thu] -> <2026-08-27 Thu 18:00>`').kind, 'occurrence-not-of-the-series');
    });

    test('a day a monthly series falls on is not reported', () => {
        assert.deepEqual(
            validateMovedLines([
                '# TODO Rent',
                '`SCHEDULED: <2026-01-31 Sat 10:00 +1m>`',
                '`MOVED: [2026-03-31 Tue] -> <2026-04-02 Thu 18:00>`'
            ]),
            []
        );
    });

    test('a repeater whose days this extension does not count says nothing', () => {
        // Working days need the public calendar the extension does not hold,
        // and an hourly repeater names no day of its own. Reporting a day as
        // outside a series the extension cannot count out would be a guess.
        for (const repeater of ['+1wd', '+3h']) {
            assert.deepEqual(
                validateMovedLines([
                    SERIES,
                    `\`SCHEDULED: <2026-08-06 Thu 15:00 ${repeater}>\``,
                    '`MOVED: [2026-08-19 Wed] -> <2026-08-27 Thu 18:00>`'
                ]),
                [],
                repeater
            );
        }
    });

    test('the bare occurrence of the older form is offered the bracketed one', () => {
        const line = '`MOVED: 2026-08-20 -> <2026-08-22 Sat 18:00>`';
        assert.equal(only(line).kind, 'occurrence-bare');
        assert.equal(fixed(line), '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`');
    });

    test('the weekday of the fix is spelt the way the series spells its own', () => {
        const line = '`MOVED: 2026-08-20 -> <2026-08-22 сб 18:00>`';
        const russian = ['# TODO Английский', '`SCHEDULED: <2026-08-06 чт 15:00 +1w>`', line];
        const found = validateMovedLines(russian);
        assert.equal(found.length, 1);
        assert.equal(found[0]?.replacement, '[2026-08-20 чт]');
    });

    test('a file writing no weekday anywhere is answered in English', () => {
        const found = validateMovedLines([
            SERIES,
            '`SCHEDULED: <2026-08-06 +1w>`',
            '`MOVED: 2026-08-20 -> <2026-08-22 18:00>`'
        ]);
        assert.equal(found.length, 1);
        assert.equal(found[0]?.replacement, '[2026-08-20 Thu]');
    });

    test('a bare occurrence that says more than a day is not a date to the extractor', () => {
        const line = '`MOVED: 2026-08-20 Thu -> <2026-08-22 Sat 18:00>`';
        assert.equal(only(line).kind, 'occurrence-not-a-date');
        assert.equal(fixed(line), '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`');
    });

    test('an occurrence held between two hours says nothing', () => {
        assert.deepEqual(
            validateMovedLines([SERIES, PLANNING, '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 15:00-16:30>`']),
            []
        );
    });

    test('a line at the indentation of the planning lines is read the same', () => {
        assert.deepEqual(
            validateMovedLines([SERIES, PLANNING, '    `MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`']),
            []
        );
    });

    test('a line that is not a move is left alone', () => {
        assert.deepEqual(validateMovedLines([SERIES, PLANNING, 'A note about the class being moved.']), []);
    });

    test('a move with no arrow names what is missing', () => {
        const violation = only('`MOVED: [2026-08-20 Thu] <2026-08-22 Sat 18:00>`');
        assert.equal(violation.kind, 'no-arrow');
        assert.equal(violation.replacement, null);
    });

    test('an occurrence written active is offered the inactive form', () => {
        const violation = only('`MOVED: <2026-08-20 Thu> -> <2026-08-22 Sat 18:00>`');
        assert.equal(violation.kind, 'occurrence-active');
        assert.equal(
            fixed('`MOVED: <2026-08-20 Thu> -> <2026-08-22 Sat 18:00>`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('an occurrence with one bracket is a mixed pair, not a missing date', () => {
        const violation = only('`MOVED: [2026-08-20 Thu -> <2026-08-22 Sat 18:00>`');
        assert.equal(violation.kind, 'occurrence-mixed-pair');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu -> <2026-08-22 Sat 18:00>`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('an occurrence carrying a repeater loses only the repeater', () => {
        const violation = only('`MOVED: [2026-08-20 Thu +1w] -> <2026-08-22 Sat 18:00>`');
        assert.equal(violation.kind, 'occurrence-has-a-repeater');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu +1w] -> <2026-08-22 Sat 18:00>`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('an occurrence carrying a warning cookie loses only the cookie', () => {
        const violation = only('`MOVED: [2026-08-20 Thu -3d] -> <2026-08-22 Sat 18:00>`');
        assert.equal(violation.kind, 'occurrence-has-a-warning-cookie');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu -3d] -> <2026-08-22 Sat 18:00>`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('an occurrence named to the hour loses the hour', () => {
        const violation = only('`MOVED: [2026-08-20 Thu 15:00] -> <2026-08-22 Sat 18:00>`');
        assert.equal(violation.kind, 'occurrence-has-an-hour');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu 15:00] -> <2026-08-22 Sat 18:00>`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('a line carrying two faults reports the one the extractor stops at', () => {
        // The extractor refuses the repeater before it looks at the hour, so a
        // fix that dropped both would answer a question the reader has not
        // reached; the hour is reported on the pass after the repeater is gone.
        const line = '`MOVED: [2026-08-20 Thu 15:00 +1w] -> <2026-08-22 Sat 18:00>`';
        assert.equal(only(line).kind, 'occurrence-has-a-repeater');
        assert.equal(fixed(line), '`MOVED: [2026-08-20 Thu 15:00] -> <2026-08-22 Sat 18:00>`');
    });

    test('an occurrence that is not a date at all offers no fix', () => {
        const violation = only('`MOVED: next Thursday -> <2026-08-22 Sat 18:00>`');
        assert.equal(violation.kind, 'occurrence-not-a-date');
        assert.equal(violation.replacement, null);
        assert.equal(violation.fixTitle, null);
    });

    test('a target written inactive is offered the active form', () => {
        const violation = only('`MOVED: [2026-08-20 Thu] -> [2026-08-22 Sat 18:00]`');
        assert.equal(violation.kind, 'target-inactive');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu] -> [2026-08-22 Sat 18:00]`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('a target with no brackets is given them', () => {
        const violation = only('`MOVED: [2026-08-20 Thu] -> 2026-08-22 Sat 18:00`');
        assert.equal(violation.kind, 'target-not-a-timestamp');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu] -> 2026-08-22 Sat 18:00`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('a target opened and closed by different brackets is offered the active form', () => {
        // The one shape of a mismatched pair: `<...]`. It reads as neither an
        // active timestamp nor an inactive one, so the rule has its own answer
        // for it, and this is the only place that answer is checked.
        const violation = only('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00]`');
        assert.equal(violation.kind, 'target-mixed-pair');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00]`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('a target carrying a repeater loses it', () => {
        const violation = only('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00 +1w>`');
        assert.equal(violation.kind, 'target-has-a-repeater');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00 +1w>`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('a target carrying a warning cookie loses it', () => {
        const violation = only('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00 -3d>`');
        assert.equal(violation.kind, 'target-has-a-warning-cookie');
        assert.equal(
            fixed('`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00 -3d>`'),
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        );
    });

    test('a target that is not a timestamp offers no fix', () => {
        const violation = only('`MOVED: [2026-08-20 Thu] -> the Saturday after`');
        assert.equal(violation.kind, 'target-not-a-timestamp');
        assert.equal(violation.replacement, null);
    });

    test('a day this entry already moves is named as the second answer it is', () => {
        const found = validateMovedLines([
            SERIES,
            PLANNING,
            '`MOVED: [2026-08-20 Thu] -> <2026-08-21 Fri 15:00>`',
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 15:00>`'
        ]);
        assert.equal(found.length, 1);
        const violation = found[0];
        assert.ok(violation);
        assert.equal(violation.kind, 'occurrence-moved-twice');
        assert.equal(violation.line, 3);
        assert.equal(violation.replacement, null);
    });

    test('two occurrences moved by one entry are both fine', () => {
        assert.deepEqual(
            validateMovedLines([
                SERIES,
                PLANNING,
                '`MOVED: [2026-08-20 Thu] -> <2026-08-21 Fri 15:00>`',
                '`MOVED: [2026-08-27 Thu] -> <2026-08-29 Sat 15:00>`'
            ]),
            []
        );
    });

    test('the same day moved by a different entry is a different move', () => {
        assert.deepEqual(
            validateMovedLines([
                SERIES,
                PLANNING,
                '`MOVED: [2026-08-20 Thu] -> <2026-08-21 Fri 15:00>`',
                '',
                '# TODO Spanish',
                '`SCHEDULED: <2026-08-06 Thu 17:00 +1w>`',
                '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 17:00>`'
            ]),
            []
        );
    });

    test('a move in an entry that does not repeat is named as having no occurrence', () => {
        const found = validateMovedLines([
            '# TODO Write the report',
            '`SCHEDULED: <2026-08-06 Thu 15:00>`',
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        ]);
        assert.equal(found.length, 1);
        assert.equal(found[0]?.kind, 'entry-does-not-repeat');
        assert.equal(found[0].replacement, null);
    });

    test('an entry with no planning line at all does not repeat either', () => {
        const found = validateMovedLines([
            '# TODO Write the report',
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        ]);
        assert.equal(found.length, 1);
        assert.equal(found[0]?.kind, 'entry-does-not-repeat');
    });

    test('a bare active timestamp that repeats keeps a series too', () => {
        assert.deepEqual(
            validateMovedLines([
                '# TODO Занятие',
                '`<2025-12-08 Пн 15:00 +1w>`',
                '`MOVED: [2026-09-07 Пн] -> <2026-09-09 Ср 13:00>`'
            ]),
            []
        );
    });

    test('a planning line standing below the move is still read', () => {
        assert.deepEqual(
            validateMovedLines([
                '# TODO Write the report',
                '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`',
                '`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`'
            ]),
            []
        );
    });

    test('a bare timestamp written inactive keeps no series', () => {
        const found = validateMovedLines([
            '# TODO Write the report',
            '`[2026-08-06 Thu 15:00 +1w]`',
            '`MOVED: [2026-08-20 Thu] -> <2026-08-22 Sat 18:00>`'
        ]);
        assert.equal(found.length, 1);
        assert.equal(found[0]?.kind, 'entry-does-not-repeat');
    });

    test('a DEADLINE that repeats is a series like any other', () => {
        assert.deepEqual(
            validateMovedLines([
                '# TODO Rent',
                '`DEADLINE: <2026-08-06 Thu ++1m -3d>`',
                '`MOVED: [2026-09-06 Sun] -> <2026-09-04 Fri>`'
            ]),
            []
        );
    });

    test('the entry fault stands beside the line fault rather than hiding it', () => {
        // Two corrections: the entry needs a repeater, and the line needs its
        // brackets. Reporting only the first would have the second found twice.
        const found = validateMovedLines([
            '# TODO Write the report',
            '`SCHEDULED: <2026-08-06 Thu 15:00>`',
            '`MOVED: <2026-08-20 Thu> -> <2026-08-22 Sat 18:00>`'
        ]);
        assert.deepEqual(
            found.map((violation) => violation.kind),
            ['entry-does-not-repeat', 'occurrence-active']
        );
    });

    test('the range underlines the half at fault, not the whole line', () => {
        const line = '`MOVED: [2026-08-20 Thu] -> [2026-08-22 Sat 18:00]`';
        const violation = only(line);
        assert.equal(line.slice(violation.startCharacter, violation.endCharacter), '[2026-08-22 Sat 18:00]');
    });
});
