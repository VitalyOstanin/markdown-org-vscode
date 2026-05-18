import * as assert from 'assert';
import { suite, test } from 'mocha';
import { parseClockDuration } from '../../utils/clockDuration';

suite('clockDuration.parseClockDuration', () => {
    test('parses well-formed H:MM strings', () => {
        assert.strictEqual(parseClockDuration('0:00'), 0);
        assert.strictEqual(parseClockDuration('0:30'), 30);
        assert.strictEqual(parseClockDuration('1:00'), 60);
        assert.strictEqual(parseClockDuration('2:15'), 135);
    });

    test('accepts multi-digit hours', () => {
        assert.strictEqual(parseClockDuration('12:30'), 12 * 60 + 30);
        assert.strictEqual(parseClockDuration('100:00'), 100 * 60);
    });

    test('returns 0 for missing minutes part (no colon)', () => {
        assert.strictEqual(parseClockDuration('12'), 0);
        assert.strictEqual(parseClockDuration(''), 0);
    });

    test('returns 0 for non-numeric components', () => {
        assert.strictEqual(parseClockDuration('abc:30'), 0);
        assert.strictEqual(parseClockDuration('12:xyz'), 0);
        assert.strictEqual(parseClockDuration('not-a-time'), 0);
    });

    test('returns 0 for more than two colon-separated parts', () => {
        assert.strictEqual(parseClockDuration('1:00:00'), 0);
    });
});
