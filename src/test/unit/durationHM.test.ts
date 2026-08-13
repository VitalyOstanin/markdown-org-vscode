import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { formatDurationHM } from '../../utils/durationHM';

/**
 * The `H:MM` form CLOCK lines and the clocktable are written in.
 *
 * The negative case is the one worth a suite: it is reachable from the editor
 * -- stepping the end of a closed entry back past its start -- and the obvious
 * implementation signs the hours and the minutes both.
 */

const MINUTE = 60_000;

suite('formatDurationHM', () => {
    test('minutes are always two digits, hours as many as they need', () => {
        assert.strictEqual(formatDurationHM(0), '0:00');
        assert.strictEqual(formatDurationHM(59 * MINUTE), '0:59');
        assert.strictEqual(formatDurationHM(150 * MINUTE), '2:30');
        assert.strictEqual(formatDurationHM(600 * MINUTE), '10:00');
    });

    test('padding aligns single-digit hours in a table column', () => {
        assert.strictEqual(formatDurationHM(150 * MINUTE, { padHoursWithSpace: true }), ' 2:30');
        assert.strictEqual(formatDurationHM(600 * MINUTE, { padHoursWithSpace: true }), '10:00');
    });

    test('an end before its start carries one sign, on the hours', () => {
        assert.strictEqual(formatDurationHM(-150 * MINUTE), '-2:30');
        assert.strictEqual(formatDurationHM(-30 * MINUTE), '-0:30');
        assert.strictEqual(formatDurationHM(-600 * MINUTE), '-10:00');
    });

    test('a signed hour fills the padded column instead of widening it', () => {
        assert.strictEqual(formatDurationHM(-150 * MINUTE, { padHoursWithSpace: true }), '-2:30');
    });
});
