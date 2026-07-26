import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { formatDayHeaderParts } from '../../utils/agendaDayHeader';
import { formatIsoDate } from '../../utils/formatIsoDate';
import { AGENDA_STRINGS, UI_LANGUAGES, formatString, pluralIndex } from '../../utils/agendaI18n';

/**
 * The agenda formats dates through `Intl` with whatever `markdown-org.dateLocale`
 * holds, which is not limited to the two languages the interface ships strings
 * for. This suite walks a spread of locales -- Latin, Cyrillic, CJK, RTL, and a
 * region without a language -- and checks that every one of them produces a
 * usable header rather than an empty field or a throw.
 *
 * Exact wording is deliberately not asserted: it comes from the ICU data of the
 * running Node build and changes between versions. What is asserted is the
 * shape: non-empty parts, digits where digits belong, and the locale actually
 * having an effect.
 */
const LOCALES = ['en-US', 'ru-RU', 'de-DE', 'fr-FR', 'es-ES', 'ja-JP', 'zh-CN', 'ar-EG', 'he-IL', 'tr-TR', 'fi-FI'];

// Any Unicode decimal digit, not just ASCII: ar-EG renders 2026 as "٢٠٢٦"
// (Arabic-Indic digits), which is correct output, not a formatting failure.
const HAS_DIGIT = /\p{Nd}/u;

suite('agenda localization across locales', () => {
    const iso = '2026-01-05'; // a Monday, single-digit day and month

    test('the day header has every part filled in, whatever the locale', () => {
        for (const locale of LOCALES) {
            const parts = formatDayHeaderParts(iso, locale);
            assert.ok(parts.weekday.length > 0, `${locale}: empty weekday`);
            assert.ok(parts.day.length > 0, `${locale}: empty day`);
            assert.ok(parts.month.length > 0, `${locale}: empty month`);
            assert.ok(HAS_DIGIT.test(parts.year), `${locale}: year without digits: "${parts.year}"`);
        }
    });

    test('the weekday actually follows the locale', () => {
        // If the locale were being ignored, every one of these would be equal.
        const weekdays = new Set(LOCALES.map((l) => formatDayHeaderParts(iso, l).weekday));
        assert.ok(weekdays.size > 3, `expected the weekday to vary by locale, got ${[...weekdays].join(', ')}`);
    });

    test('offset dates render in the locale and stay one line', () => {
        for (const locale of LOCALES) {
            const formatted = formatIsoDate(iso, locale);
            assert.ok(formatted.length > 0, `${locale}: empty date`);
            assert.ok(!formatted.includes('\n'), `${locale}: date spans lines: "${formatted}"`);
            assert.ok(HAS_DIGIT.test(formatted), `${locale}: date without digits: "${formatted}"`);
        }
    });

    test('a malformed or unknown tag degrades instead of throwing', () => {
        for (const locale of ['ru_RU', 'not-a-locale', 'xx-YY', '']) {
            const parts = formatDayHeaderParts(iso, locale);
            assert.ok(parts.weekday.length > 0, `${locale}: empty weekday after degrading`);
            assert.ok(formatIsoDate(iso, locale).length > 0, `${locale}: empty offset date after degrading`);
        }
    });

    // The interface language is a separate axis from the date locale: a user can
    // read Russian dates with an English interface. Whichever is picked, no
    // counted noun may render as "5 undefined".
    test('counted nouns resolve for every count in every shipped language', () => {
        for (const lang of UI_LANGUAGES) {
            const strings = AGENDA_STRINGS[lang];
            for (const forms of [strings.summary.tasks, strings.countChip.tasks]) {
                for (let n = 0; n <= 120; n++) {
                    const form = forms[pluralIndex(n, lang)];
                    assert.ok(form, `${lang}: no plural form for ${n}`);
                    assert.ok(!formatString('{0} {1}', String(n), form).includes('undefined'));
                }
            }
        }
    });
});
