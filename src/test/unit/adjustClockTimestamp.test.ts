import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { adjustClockTimestamp } from '../../utils/adjustClockTimestamp';
import { getClockTimestampPartAt } from '../../utils/timestampParts';
import type { ClockTimestampPart } from '../../utils/timestampParts';

/**
 * Shifting one part of a CLOCK line.
 *
 * The line has two halves and one rule, so the suite is written the other way
 * round from the code: instead of checking each half against a literal, it
 * shifts the same unit on both halves of a line whose halves are identical and
 * requires the two to come out the same. A rule that lives in one place passes
 * this by construction; two copies of it pass only while nobody edits one of
 * them.
 */

/**
 * A column inside the start timestamp -- its year -- so the hit carries the
 * match of the whole line, which is what the shift reads. Computed from the
 * line rather than fixed, so an indented fixture lands in the same place.
 */
function columnInStart(line: string): number {
    return line.search(/[[<]/) + 1;
}

function shift(line: string, part: ClockTimestampPart, delta: number): string {
    const hit = getClockTimestampPartAt(line, columnInStart(line));
    assert.ok(hit, `the fixture is not a CLOCK line: ${line}`);
    return adjustClockTimestamp(hit.match, part, delta);
}

/** The `[...]` stamp of one half of a rendered CLOCK line. */
function half(line: string, side: 'start' | 'end'): string {
    const body = line.slice(line.indexOf('`CLOCK: ') + '`CLOCK: '.length);
    const stamps = body.split('--');
    const stamp = side === 'start' ? stamps[0] : stamps[1];
    assert.ok(stamp, `no ${side} half in ${line}`);
    return stamp.split(' =>')[0] ?? stamp;
}

const UNITS = ['year', 'month', 'day', 'weekday', 'hour', 'minute'] as const;

suite('adjustClockTimestamp', () => {
    // Both halves hold the same instant, so whatever the shift does to one of
    // them it must do to the other. The date is deliberately awkward: the last
    // day of a 31-day month at the last half hour, so a shift of any unit
    // crosses a boundary of some kind.
    const SAME = '`CLOCK: [2026-01-31 Сб 23:30]--[2026-01-31 Сб 23:30] =>  0:00`';

    for (const unit of UNITS) {
        test(`shifting ${unit} treats both halves by the same rule`, () => {
            for (const delta of [1, -1]) {
                const started = half(shift(SAME, `start-${unit}`, delta), 'start');
                const ended = half(shift(SAME, `end-${unit}`, delta), 'end');
                assert.strictEqual(ended, started, `${unit} by ${delta}: the halves disagree`);
            }
        });
    }

    test('a month that overflows the day rolls over, in both halves alike', () => {
        // 31 January + 1 month has no 31 February: JS Date lands on 3 March,
        // and the weekday follows the day it lands on rather than the one that
        // was written.
        assert.strictEqual(half(shift(SAME, 'start-month', 1), 'start'), '[2026-03-03 Вт 23:30]');
        assert.strictEqual(half(shift(SAME, 'end-month', 1), 'end'), '[2026-03-03 Вт 23:30]');
    });

    test('shifting the weekday moves the day, as stepping the day does', () => {
        assert.strictEqual(half(shift(SAME, 'start-weekday', 1), 'start'), '[2026-02-01 Вс 23:30]');
        assert.strictEqual(half(shift(SAME, 'start-day', 1), 'start'), '[2026-02-01 Вс 23:30]');
    });

    test('the weekday keeps the alphabet and the length it was written in', () => {
        const english = '`CLOCK: [2026-01-31 Saturday 23:30]--[2026-01-31 Saturday 23:30] =>  0:00`';
        assert.strictEqual(half(shift(english, 'start-day', 1), 'start'), '[2026-02-01 Sunday 23:30]');
        assert.strictEqual(half(shift(english, 'end-day', 1), 'end'), '[2026-02-01 Sunday 23:30]');
    });

    test('the duration is recomputed from the shifted halves', () => {
        const line = '`CLOCK: [2026-05-25 Пн 10:00]--[2026-05-25 Пн 12:00] =>  2:00`';
        assert.strictEqual(
            shift(line, 'end-hour', 1),
            '`CLOCK: [2026-05-25 Пн 10:00]--[2026-05-25 Пн 13:00] =>  3:00`'
        );
        assert.strictEqual(
            shift(line, 'start-hour', 1),
            '`CLOCK: [2026-05-25 Пн 11:00]--[2026-05-25 Пн 12:00] =>  1:00`'
        );
    });

    test('an open entry keeps its single half and grows no duration', () => {
        const open = '`CLOCK: [2026-05-25 Пн 10:00]`';
        assert.strictEqual(shift(open, 'start-hour', 1), '`CLOCK: [2026-05-25 Пн 11:00]`');
    });

    test('a mismatched bracket pair is normalized on both halves the same way', () => {
        // CLOCK_PARTS_REGEX permits `[…>`, which org never emits; whichever
        // half carries it, the rendered stamp comes back as a matching pair.
        const mixed = '`CLOCK: [2026-05-25 Пн 10:00>--[2026-05-25 Пн 12:00> =>  2:00`';
        assert.strictEqual(half(shift(mixed, 'start-hour', 0), 'start'), '[2026-05-25 Пн 10:00]');
        assert.strictEqual(half(shift(mixed, 'end-hour', 0), 'end'), '[2026-05-25 Пн 12:00]');
    });

    test('the indentation of the line is kept', () => {
        const indented = '    `CLOCK: [2026-05-25 Пн 10:00]--[2026-05-25 Пн 12:00] =>  2:00`';
        assert.ok(shift(indented, 'start-hour', 1).startsWith('    `CLOCK: '));
    });
});
