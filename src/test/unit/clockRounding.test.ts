import * as assert from 'assert';
import { suite, test } from 'mocha';
import { isRoundingEnabled, roundTime, roundEndTime } from '../../utils/clockRounding';

function at(h: number, m: number): Date {
    return new Date(2026, 0, 15, h, m, 0, 0);
}

suite('clockRounding.isRoundingEnabled', () => {
    test('treats undefined as disabled', () => {
        assert.strictEqual(isRoundingEnabled(undefined), false);
    });

    test('treats 0 as disabled', () => {
        assert.strictEqual(isRoundingEnabled(0), false);
    });

    test('treats negative as disabled', () => {
        assert.strictEqual(isRoundingEnabled(-5), false);
        assert.strictEqual(isRoundingEnabled(-30), false);
    });

    test('treats NaN as disabled', () => {
        assert.strictEqual(isRoundingEnabled(Number.NaN), false);
    });

    test('treats values above 60 as disabled (out of schema range)', () => {
        assert.strictEqual(isRoundingEnabled(61), false);
        assert.strictEqual(isRoundingEnabled(1000), false);
    });

    test('accepts the documented samples 15 and 30', () => {
        assert.strictEqual(isRoundingEnabled(15), true);
        assert.strictEqual(isRoundingEnabled(30), true);
    });

    test('accepts the boundaries 1 and 60', () => {
        assert.strictEqual(isRoundingEnabled(1), true);
        assert.strictEqual(isRoundingEnabled(60), true);
    });
});

suite('clockRounding.roundTime', () => {
    test('returns the input untouched when rounding is disabled', () => {
        const t = at(10, 17);
        assert.strictEqual(roundTime(t, undefined).getTime(), t.getTime());
        assert.strictEqual(roundTime(t, 0).getTime(), t.getTime());
        assert.strictEqual(roundTime(t, -5).getTime(), t.getTime());
        assert.strictEqual(roundTime(t, Number.NaN).getTime(), t.getTime());
        assert.strictEqual(roundTime(t, 61).getTime(), t.getTime());
    });

    test('floors minutes to the nearest rounding bucket', () => {
        // 10:17 with 15-minute buckets -> 10:15
        assert.strictEqual(roundTime(at(10, 17), 15).getMinutes(), 15);
        // 10:29 with 30-minute buckets -> 10:00
        assert.strictEqual(roundTime(at(10, 29), 30).getMinutes(), 0);
        // 10:31 with 30-minute buckets -> 10:30
        assert.strictEqual(roundTime(at(10, 31), 30).getMinutes(), 30);
    });

    test('zeroes seconds and milliseconds', () => {
        const t = new Date(2026, 0, 15, 10, 17, 42, 500);
        const r = roundTime(t, 15);
        assert.strictEqual(r.getSeconds(), 0);
        assert.strictEqual(r.getMilliseconds(), 0);
    });
});

suite('clockRounding.roundEndTime', () => {
    test('returns endDate untouched when rounding is disabled', () => {
        const start = at(10, 0);
        const end = at(10, 17);
        assert.strictEqual(roundEndTime(start, end, undefined).getTime(), end.getTime());
        assert.strictEqual(roundEndTime(start, end, 0).getTime(), end.getTime());
        assert.strictEqual(roundEndTime(start, end, -10).getTime(), end.getTime());
        assert.strictEqual(roundEndTime(start, end, Number.NaN).getTime(), end.getTime());
        assert.strictEqual(roundEndTime(start, end, 61).getTime(), end.getTime());
    });

    test('ceils end minutes to the next rounding bucket', () => {
        // start 10:00, end 10:17, 15-min buckets -> 10:30
        assert.strictEqual(roundEndTime(at(10, 0), at(10, 17), 15).getMinutes(), 30);
        // start 10:00, end 10:01, 30-min buckets -> 10:30
        assert.strictEqual(roundEndTime(at(10, 0), at(10, 1), 30).getMinutes(), 30);
    });

    test('bumps by one bucket when ceil(end) <= start to keep duration > 0', () => {
        // start 10:30, end 10:25 (clock skew), 30-min buckets ceil = 10:30
        // 10:30 <= 10:30 -> bump to 11:00
        const r = roundEndTime(at(10, 30), at(10, 25), 30);
        assert.strictEqual(r.getHours(), 11);
        assert.strictEqual(r.getMinutes(), 0);
    });

    test('zeroes seconds and milliseconds', () => {
        const r = roundEndTime(at(10, 0), new Date(2026, 0, 15, 10, 17, 42, 500), 15);
        assert.strictEqual(r.getSeconds(), 0);
        assert.strictEqual(r.getMilliseconds(), 0);
    });
});
