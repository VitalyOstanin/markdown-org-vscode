import * as assert from 'assert';
import { resolveDayRolloverAnchor } from '../../utils/dayRolloverAnchor';

suite('resolveDayRolloverAnchor', () => {
    test('a panel still showing the day that ended follows the clock', () => {
        assert.strictEqual(resolveDayRolloverAnchor('2026-07-25', '2026-07-25', '2026-07-26'), '2026-07-26');
    });

    test('an anchor the user navigated to is kept', () => {
        assert.strictEqual(resolveDayRolloverAnchor('2026-08-10', '2026-07-25', '2026-07-26'), '2026-08-10');
    });

    test('a panel with no anchor yet gets the new day', () => {
        assert.strictEqual(resolveDayRolloverAnchor(undefined, '2026-07-25', '2026-07-26'), '2026-07-26');
        assert.strictEqual(resolveDayRolloverAnchor('', '2026-07-25', '2026-07-26'), '2026-07-26');
    });

    // The timer re-arms itself, so a missed wake-up (suspend, a long stall)
    // can fire a full day late. The anchor still lands on the real today
    // rather than on the day after the one it was armed on.
    test('a rollover that fires late still lands on today', () => {
        assert.strictEqual(resolveDayRolloverAnchor('2026-07-25', '2026-07-25', '2026-07-28'), '2026-07-28');
    });
});
