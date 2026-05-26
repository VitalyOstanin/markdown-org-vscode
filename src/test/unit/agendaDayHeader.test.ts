import * as assert from 'assert';
import { suite, test } from 'mocha';
import { formatDayHeaderParts } from '../../utils/agendaDayHeader';

suite('agendaDayHeader.formatDayHeaderParts', () => {
    test('en-US (default locale): day is the number, month is the name -- not swapped', () => {
        // toLocaleDateString('en-US', {day,month}) is "January 5"; positional
        // parsing used to put "January" into the day column and "5" into the
        // month column. Extraction by token type must keep them apart.
        const parts = formatDayHeaderParts('2025-01-05', 'en-US');
        assert.strictEqual(parts.day, '5');
        assert.strictEqual(parts.month, 'January');
        assert.strictEqual(parts.year, '2025');
        assert.strictEqual(parts.weekday, 'Sunday');
    });

    test('ru-RU: month keeps the genitive form used alongside the day', () => {
        // Combined "5 января" (genitive). A standalone {month:'long'} call
        // would yield the nominative "январь" -- the regression this design
        // avoids by reading the combined format with formatToParts.
        const parts = formatDayHeaderParts('2025-01-05', 'ru-RU');
        assert.strictEqual(parts.day, '5');
        assert.strictEqual(parts.month, 'января');
        assert.strictEqual(parts.year, '2025');
        assert.strictEqual(parts.weekday, 'воскресенье');
    });

    test('en-GB (day-month order): unchanged correct behavior', () => {
        const parts = formatDayHeaderParts('2025-01-05', 'en-GB');
        assert.strictEqual(parts.day, '5');
        assert.strictEqual(parts.month, 'January');
    });

    test('ja-JP (no space separator): month not empty, day not the whole string', () => {
        // Previous code returned day="1月5日", month="" here. We require a
        // real day number and a non-empty month. The 月 suffix lands in a
        // literal token, so month is the bare number "1" (documented CJK
        // trade-off).
        const parts = formatDayHeaderParts('2025-01-05', 'ja-JP');
        assert.strictEqual(parts.day, '5');
        assert.strictEqual(parts.month, '1');
    });

    test('two-digit day at year end is zero-handled and not confused with month', () => {
        const parts = formatDayHeaderParts('2025-12-31', 'en-US');
        assert.strictEqual(parts.day, '31');
        assert.strictEqual(parts.month, 'December');
        assert.strictEqual(parts.year, '2025');
    });
});
