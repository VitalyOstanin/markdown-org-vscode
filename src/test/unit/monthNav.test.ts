import * as assert from 'node:assert/strict';
import { shiftMonthAnchor } from '../../utils/monthNav';

function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

suite('monthNav.shiftMonthAnchor', () => {
    test('does not skip February when the anchor day is 31 (regression)', () => {
        // Jan 31 + 1 month: naive setMonth would roll over to early March,
        // skipping February. Anchoring to day 1 lands in February.
        assert.equal(ymd(shiftMonthAnchor(new Date(2026, 0, 31), 1)), '2026-02-01');
    });

    test('does not skip short months going backward (Mar 31 -1)', () => {
        assert.equal(ymd(shiftMonthAnchor(new Date(2026, 2, 31), -1)), '2026-02-01');
    });

    test('always anchors to the first of the target month', () => {
        assert.equal(ymd(shiftMonthAnchor(new Date(2026, 5, 15), 0)), '2026-06-01');
        assert.equal(ymd(shiftMonthAnchor(new Date(2026, 5, 15), 2)), '2026-08-01');
    });

    test('rolls across year boundaries', () => {
        assert.equal(ymd(shiftMonthAnchor(new Date(2026, 11, 10), 1)), '2027-01-01');
        assert.equal(ymd(shiftMonthAnchor(new Date(2026, 0, 10), -1)), '2025-12-01');
    });
});
