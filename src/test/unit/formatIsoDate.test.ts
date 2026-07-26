import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { formatIsoDate } from '../../utils/formatIsoDate';

suite('formatIsoDate', () => {
    test('follows the locale rather than a fixed day-first order', () => {
        assert.strictEqual(formatIsoDate('2026-08-12', 'ru-RU'), '12.08.2026');
        assert.strictEqual(formatIsoDate('2026-08-12', 'en-US'), '08/12/2026');
        assert.strictEqual(formatIsoDate('2026-08-12', 'en-GB'), '12/08/2026');
    });

    test('keeps fixed-width fields so the offset column stays aligned', () => {
        assert.strictEqual(formatIsoDate('2026-01-05', 'ru-RU'), '05.01.2026');
    });

    test('accepts a full timestamp and reads only its date part', () => {
        assert.strictEqual(formatIsoDate('2026-08-12 14:00', 'ru-RU'), '12.08.2026');
    });

    test('passes through anything that is not an ISO date', () => {
        assert.strictEqual(formatIsoDate('tomorrow', 'ru-RU'), 'tomorrow');
        assert.strictEqual(formatIsoDate('', 'ru-RU'), '');
    });

    test('an unusable locale falls back to the runtime default instead of throwing', () => {
        // `ru_RU` (underscore) makes Intl throw; the function is inlined into
        // the webview and must not take a render down with it.
        const formatted = formatIsoDate('2026-08-12', 'ru_RU');
        assert.ok(/\d{2}/.test(formatted), `expected a formatted date, got ${formatted}`);
    });
});
