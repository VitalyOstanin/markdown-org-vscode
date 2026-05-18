import * as assert from 'assert';
import { suite, test } from 'mocha';
import { toIsoDate } from '../../utils/isoDate';

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
