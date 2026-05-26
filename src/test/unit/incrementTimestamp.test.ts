import * as assert from 'assert';
import { suite, test } from 'mocha';
import { incrementTimestamp } from '../../utils/incrementTimestamp';
import { getTimestampPartAt, TimestampPart } from '../../utils/timestampParts';

/**
 * Behaviour of `incrementTimestamp` -- the Shift+Up / Shift+Down engine for a
 * single timestamp part. The previous `Increment month/day/...` tests in
 * timestamp.test.ts only exercised the native `Date.setMonth` on a throwaway
 * `Date`; they never called the extension's function, so its real behaviour
 * (date normalization, weekday recompute, bracket/repeater/time preservation)
 * was unguarded.
 *
 * The match is produced by the production parser `getTimestampPartAt`, so the
 * named groups are exactly what `adjustTimestamp` feeds in at runtime. Column 6
 * is the first month digit, present in every timestamp form, so it is a stable
 * probe to obtain the full match regardless of which part the test then shifts.
 *
 * Month-overflow parity with org-mode (verified against GNU Emacs 29.4
 * `org-timestamp-change`): incrementing the month builds `(year, month+1, day)`
 * and lets the date normalize -- org does NOT clamp to the last day of the
 * target month. So 2026-05-31 +1mo -> 2026-07-01 (June skipped), and
 * 2026-01-31 +1mo -> 2026-03-03. See memory reference-timestamp-month-overflow.
 */
function matchOf(ts: string): RegExpMatchArray {
    const hit = getTimestampPartAt(ts, 6);
    assert.ok(hit, `getTimestampPartAt failed to parse ${ts}`);
    return hit.match;
}

function inc(ts: string, part: TimestampPart, delta: number): string {
    return incrementTimestamp(matchOf(ts), part, delta, ts.startsWith('<'));
}

suite('incrementTimestamp', () => {
    suite('month overflow matches org-mode (no clamp to last day)', () => {
        test('2026-05-31 +1 month -> 2026-07-01 (June skipped)', () => {
            assert.strictEqual(inc('<2026-05-31 Sun 12:00 +1d>', 'month', 1), '<2026-07-01 Wed 12:00 +1d>');
        });

        test('2026-01-31 +1 month -> 2026-03-03 (February skipped)', () => {
            assert.strictEqual(inc('<2026-01-31 Sat 12:00 +1d>', 'month', 1), '<2026-03-03 Tue 12:00 +1d>');
        });
    });

    suite('in-range month change keeps the day', () => {
        test('2026-05-15 +1 month -> 2026-06-15', () => {
            assert.strictEqual(inc('<2026-05-15 Fri 12:00 +1d>', 'month', 1), '<2026-06-15 Mon 12:00 +1d>');
        });

        test('2026-06-15 -1 month -> 2026-05-15', () => {
            assert.strictEqual(inc('<2026-06-15 Mon 12:00>', 'month', -1), '<2026-05-15 Fri 12:00>');
        });
    });

    suite('day / weekday shift recomputes the rest of the date', () => {
        test('day +1 rolls 2025-12-31 into the next year', () => {
            assert.strictEqual(inc('<2025-12-31 Wed 23:00>', 'day', 1), '<2026-01-01 Thu 23:00>');
        });

        test('weekday part shifts the date like day does', () => {
            assert.strictEqual(inc('<2026-05-15 Fri 12:00>', 'weekday', 1), '<2026-05-16 Sat 12:00>');
        });
    });

    test('year +1 keeps month/day, recomputes weekday', () => {
        assert.strictEqual(inc('<2026-05-15 Fri 12:00>', 'year', 1), '<2027-05-15 Sat 12:00>');
    });

    test('hour +1 at 23:00 rolls into the next day and weekday', () => {
        assert.strictEqual(inc('<2026-05-15 Fri 23:00>', 'hour', 1), '<2026-05-16 Sat 00:00>');
    });

    test('minute +1 changes only the minute', () => {
        assert.strictEqual(inc('<2026-05-15 Fri 12:30>', 'minute', 1), '<2026-05-15 Fri 12:31>');
    });

    test('inactive [...] bracket form is preserved', () => {
        assert.strictEqual(inc('[2026-05-31 Sun 12:00]', 'month', 1), '[2026-07-01 Wed 12:00]');
    });

    test('date-only timestamp stays date-only (no time injected)', () => {
        assert.strictEqual(inc('<2026-05-31 Sun>', 'month', 1), '<2026-07-01 Wed>');
    });

    test('Russian weekday stays Russian after recompute', () => {
        assert.strictEqual(inc('<2026-05-31 Вс 12:00>', 'month', 1), '<2026-07-01 Ср 12:00>');
    });

    test('timestamp without a weekday keeps having none', () => {
        assert.strictEqual(inc('<2026-05-15 12:00>', 'month', 1), '<2026-06-15 12:00>');
    });

    test('repeater (++1w catch-up) survives a day shift', () => {
        assert.strictEqual(inc('<2026-05-15 Fri 12:00 ++1w>', 'day', 1), '<2026-05-16 Sat 12:00 ++1w>');
    });
});
