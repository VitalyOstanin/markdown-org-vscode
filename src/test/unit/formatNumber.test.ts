import * as assert from 'node:assert';
import { formatNumber } from '../../utils/formatNumber';

suite('formatNumber', () => {
    test('formats in the locale numbering system, like the dates next to it', () => {
        // ar-EG uses Arabic-Indic digits for dates, so a year or a day number
        // printed as a raw JS number would sit in the same line in a different
        // numbering system.
        assert.strictEqual(
            formatNumber(2026, 'ar-EG'),
            new Date(Date.UTC(2026, 0, 1)).toLocaleDateString('ar-EG', { year: 'numeric', timeZone: 'UTC' })
        );
        assert.strictEqual(formatNumber(5, 'ar-EG'), '٥');
    });

    test('leaves Latin-digit locales as they were', () => {
        assert.strictEqual(formatNumber(2026, 'en-US'), '2026');
        assert.strictEqual(formatNumber(5, 'ru-RU'), '5');
    });

    test('a year is printed without grouping separators', () => {
        // Intl.NumberFormat groups by default: "2,026" in en-US, "2 026" in
        // ru-RU. A year is not a quantity and must not be grouped.
        assert.strictEqual(formatNumber(2026, 'ru-RU'), '2026');
        assert.strictEqual(formatNumber(12345, 'en-US'), '12345');
    });

    test('an unusable locale falls back to the host default instead of throwing', () => {
        // dateLocale is validated elsewhere, but this helper also runs on the
        // page, where a bad value must degrade rather than blank the panel.
        assert.strictEqual(formatNumber(7, 'ru_RU'), '7');
        assert.strictEqual(formatNumber(7, ''), '7');
    });
});
