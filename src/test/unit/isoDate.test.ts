import * as assert from 'assert';
import { suite, test } from 'mocha';
import { isIsoDate, toIsoDate } from '../../utils/isoDate';

suite('isoDate.toIsoDate', () => {
    test('formats a Date as local YYYY-MM-DD with zero-padding', () => {
        const d = new Date(2025, 0, 5, 12, 0, 0);
        assert.strictEqual(toIsoDate(d), '2025-01-05');
    });

    test('zero-pads month and day for single-digit values', () => {
        assert.strictEqual(toIsoDate(new Date(2025, 8, 9, 0, 0)), '2025-09-09');
    });

    test('uses local time (no UTC conversion) for late-evening dates near a TZ boundary', () => {
        // Construct a local date at 23:30 on Dec 31; UTC could shift forward to
        // Jan 1 of the next year if we accidentally used toISOString(). The
        // local-date implementation must always return the same calendar day
        // the user sees in their timezone.
        const d = new Date(2025, 11, 31, 23, 30, 0);
        assert.strictEqual(toIsoDate(d), '2025-12-31');
    });

    test('zero-pads single-digit months and days but not single-digit hours/minutes (out of scope)', () => {
        // Sanity that the function ignores the time-of-day fields entirely.
        const morning = new Date(2025, 0, 1, 1, 5);
        const evening = new Date(2025, 0, 1, 23, 59);
        assert.strictEqual(toIsoDate(morning), toIsoDate(evening));
    });
});

// The webview sends an anchor date back to the extension, which forwards it
// into the extractor's `--date` argument. The value therefore has to be
// checked against the one shape the CLI accepts rather than passed through.
suite('isoDate.isIsoDate', () => {
    test('accepts what toIsoDate produces', () => {
        assert.strictEqual(isIsoDate(toIsoDate(new Date(2026, 6, 25))), true);
        assert.strictEqual(isIsoDate('2026-01-01'), true);
        assert.strictEqual(isIsoDate('1999-12-31'), true);
    });

    test('rejects a well-formed shape that is not a real calendar day', () => {
        assert.strictEqual(isIsoDate('2026-13-01'), false);
        assert.strictEqual(isIsoDate('2026-02-30'), false);
        assert.strictEqual(isIsoDate('2026-00-10'), false);
        assert.strictEqual(isIsoDate('2026-01-32'), false);
        // 2026 is not a leap year, 2024 is.
        assert.strictEqual(isIsoDate('2026-02-29'), false);
        assert.strictEqual(isIsoDate('2024-02-29'), true);
    });

    test('rejects padding-free, over-long and decorated values', () => {
        assert.strictEqual(isIsoDate('2026-1-5'), false);
        assert.strictEqual(isIsoDate('2026-01-05T00:00'), false);
        assert.strictEqual(isIsoDate(' 2026-01-05'), false);
        assert.strictEqual(isIsoDate('2026-01-05 --tasks'), false);
    });

    test('rejects nullish and non-string input', () => {
        assert.strictEqual(isIsoDate(undefined), false);
        assert.strictEqual(isIsoDate(null), false);
        assert.strictEqual(isIsoDate(''), false);
        assert.strictEqual(isIsoDate(20260125 as unknown as string), false);
    });
});
