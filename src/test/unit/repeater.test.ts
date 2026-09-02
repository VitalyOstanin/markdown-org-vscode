import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { addMonths, describe, nextOccurrence, parseRepeater, RepeaterError } from '../../utils/repeater';

// The dates below are the ones markdown-org-ffi's own tests use (planning.rs),
// so a change on either side that moves a task to a different day fails here.

suite('parseRepeater', () => {
    test('the three prefixes name the three forms', () => {
        assert.deepStrictEqual(parseRepeater('+1d'), { type: 'cumulative', value: 1, unit: 'day' });
        assert.deepStrictEqual(parseRepeater('++2w'), { type: 'catchUp', value: 2, unit: 'week' });
        assert.deepStrictEqual(parseRepeater('.+3m'), { type: 'restart', value: 3, unit: 'month' });
    });

    test('wd is read as working days rather than as a day repeater', () => {
        assert.deepStrictEqual(parseRepeater('+2wd'), { type: 'cumulative', value: 2, unit: 'workday' });
    });

    test('what is not a repeater is not one', () => {
        assert.strictEqual(parseRepeater('1d'), null);
        assert.strictEqual(parseRepeater('+d'), null);
        assert.strictEqual(parseRepeater('-2d'), null);
        assert.strictEqual(parseRepeater('+1x'), null);
        // A zero interval would never pass today, so a catch-up on it would spin.
        assert.strictEqual(parseRepeater('+0d'), null);
    });
});

suite('nextOccurrence', () => {
    const today = new Date(2026, 6, 31); // 2026-07-31

    test('a bare + takes one step, even when the result is still in the past', () => {
        const moved = nextOccurrence({
            base: new Date(2026, 0, 5),
            today,
            repeater: { type: 'cumulative', value: 1, unit: 'day' }
        });
        assert.deepStrictEqual(moved, new Date(2026, 0, 6));
    });

    test('++ steps until it passes today', () => {
        const moved = nextOccurrence({
            base: new Date(2026, 6, 1),
            today,
            repeater: { type: 'catchUp', value: 1, unit: 'week' }
        });
        // 08, 15, 22, 29 are still on or before the 31st; 2026-08-05 is not.
        assert.deepStrictEqual(moved, new Date(2026, 7, 5));
    });

    test('++ takes at least one step when the date is already ahead', () => {
        const moved = nextOccurrence({
            base: new Date(2026, 7, 10),
            today,
            repeater: { type: 'catchUp', value: 1, unit: 'week' }
        });
        assert.deepStrictEqual(moved, new Date(2026, 7, 17));
    });

    test('.+ restarts from today, whatever the file says', () => {
        const moved = nextOccurrence({
            base: new Date(2020, 0, 1),
            today,
            repeater: { type: 'restart', value: 3, unit: 'day' }
        });
        assert.deepStrictEqual(moved, new Date(2026, 7, 3));
    });

    test('a month is a month, and the day clamps rather than spilling over', () => {
        const moved = nextOccurrence({
            base: new Date(2026, 0, 31),
            today,
            repeater: { type: 'cumulative', value: 1, unit: 'month' }
        });
        // Not 2026-03-03: the core clamps, and a spill would put the two
        // clients on different dates.
        assert.deepStrictEqual(moved, new Date(2026, 1, 28));
    });

    test('a year is twelve months, leap day included', () => {
        const moved = nextOccurrence({
            base: new Date(2024, 1, 29),
            today,
            repeater: { type: 'cumulative', value: 1, unit: 'year' }
        });
        assert.deepStrictEqual(moved, new Date(2025, 1, 28));
    });

    test('working days skip what the calendar says is not one', () => {
        // Friday 2026-07-31, with the weekend closed and Monday a holiday.
        const closed = new Set(['2026-08-01', '2026-08-02', '2026-08-03']);
        const moved = nextOccurrence({
            base: new Date(2026, 6, 31),
            today,
            repeater: { type: 'cumulative', value: 2, unit: 'workday' },
            isWorkday: (date) => !closed.has(iso(date))
        });
        assert.deepStrictEqual(moved, new Date(2026, 7, 5));
    });

    test('working days without a calendar are refused rather than guessed', () => {
        assert.throws(
            () =>
                nextOccurrence({
                    base: new Date(2026, 6, 31),
                    today,
                    repeater: { type: 'cumulative', value: 1, unit: 'workday' }
                }),
            RepeaterError
        );
    });

    test('an hourly repeater is refused: it moves a time, not a date', () => {
        assert.throws(
            () =>
                nextOccurrence({
                    base: new Date(2026, 6, 31),
                    today,
                    repeater: { type: 'cumulative', value: 6, unit: 'hour' }
                }),
            RepeaterError
        );
    });

    test('a ++ date too far back to reach today is refused rather than looped over', () => {
        // A daily catch-up from three centuries ago needs more steps than the
        // loop is willing to take. Without the ceiling the command would spin
        // on a typo in a year, with nothing on screen to say why.
        assert.throws(
            () =>
                nextOccurrence({
                    base: new Date(1700, 0, 1),
                    today,
                    repeater: { type: 'catchUp', value: 1, unit: 'day' }
                }),
            RepeaterError
        );
    });
});

suite('describe', () => {
    test('each kind of repeater is written the way a file writes it', () => {
        // The text goes into the message the refusals above carry, so it has to
        // read as the token the user typed rather than as the internal name.
        assert.strictEqual(describe({ type: 'cumulative', value: 1, unit: 'day' }), '+1d');
        assert.strictEqual(describe({ type: 'catchUp', value: 2, unit: 'week' }), '++2w');
        assert.strictEqual(describe({ type: 'restart', value: 3, unit: 'month' }), '.+3m');
        assert.strictEqual(describe({ type: 'cumulative', value: 4, unit: 'year' }), '+4y');
        assert.strictEqual(describe({ type: 'cumulative', value: 6, unit: 'hour' }), '+6h');
    });

    test('a working-day repeater keeps its two-letter unit', () => {
        assert.strictEqual(describe({ type: 'cumulative', value: 2, unit: 'workday' }), '+2wd');
    });
});

suite('addMonths', () => {
    test('the day is kept where the target month is long enough', () => {
        assert.deepStrictEqual(addMonths(new Date(2026, 0, 15), 1), new Date(2026, 1, 15));
    });

    test('the day clamps to the end of a shorter month', () => {
        assert.deepStrictEqual(addMonths(new Date(2026, 0, 31), 1), new Date(2026, 1, 28));
        assert.deepStrictEqual(addMonths(new Date(2026, 4, 31), 1), new Date(2026, 5, 30));
    });

    test('the year rolls over', () => {
        assert.deepStrictEqual(addMonths(new Date(2026, 11, 15), 1), new Date(2027, 0, 15));
    });
});

/** `date` as `YYYY-MM-DD`, for the working-calendar stand-in above. */
function iso(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}
