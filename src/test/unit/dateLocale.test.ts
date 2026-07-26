import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { FALLBACK_DATE_LOCALE, isUsableDateLocale, resolveDateLocale } from '../../utils/dateLocale';

suite('dateLocale', () => {
    test('accepts the tags the setting documents', () => {
        for (const tag of ['en-US', 'ru-RU', 'de-DE', 'ja-JP', 'en']) {
            assert.strictEqual(isUsableDateLocale(tag), true, `expected ${tag} to be usable`);
        }
    });

    test('rejects tags Intl refuses to construct', () => {
        // Underscore instead of a hyphen is the realistic typo: Intl throws a
        // RangeError on it rather than degrading.
        assert.strictEqual(isUsableDateLocale('ru_RU'), false);
        assert.strictEqual(isUsableDateLocale('not a locale'), false);
    });

    test('an unusable setting falls back to English and reports what was rejected', () => {
        assert.deepStrictEqual(resolveDateLocale('ru_RU'), {
            locale: FALLBACK_DATE_LOCALE,
            rejected: 'ru_RU'
        });
    });

    test('a usable setting is passed through, trimmed', () => {
        assert.deepStrictEqual(resolveDateLocale('  ru-RU  '), { locale: 'ru-RU' });
    });

    test('empty or missing is the default, not a rejection', () => {
        // No `rejected` key: "unset" must not produce a warning.
        assert.deepStrictEqual(resolveDateLocale(''), { locale: FALLBACK_DATE_LOCALE });
        assert.deepStrictEqual(resolveDateLocale('   '), { locale: FALLBACK_DATE_LOCALE });
        assert.deepStrictEqual(resolveDateLocale(undefined), { locale: FALLBACK_DATE_LOCALE });
        assert.deepStrictEqual(resolveDateLocale(null), { locale: FALLBACK_DATE_LOCALE });
    });
});
