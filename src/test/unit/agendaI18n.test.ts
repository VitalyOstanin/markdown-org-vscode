import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    AGENDA_STRINGS,
    AgendaStrings,
    UI_LANGUAGES,
    formatString,
    pluralIndex,
    resolveUiLanguage
} from '../../utils/agendaI18n';

suite('resolveUiLanguage', () => {
    test('an explicit setting wins over both locales', () => {
        assert.strictEqual(resolveUiLanguage('en', 'ru-RU', 'ru'), 'en');
        assert.strictEqual(resolveUiLanguage('ru', 'en-US', 'en'), 'ru');
    });

    test('auto follows the date locale first', () => {
        // The point of the whole setting: dates in Russian must not leave the
        // buttons in English.
        assert.strictEqual(resolveUiLanguage('auto', 'ru-RU', 'en'), 'ru');
        assert.strictEqual(resolveUiLanguage('auto', 'en-US', 'ru'), 'en');
    });

    test('auto falls back to the editor display language, then to English', () => {
        assert.strictEqual(resolveUiLanguage('auto', 'de-DE', 'ru'), 'ru');
        assert.strictEqual(resolveUiLanguage('auto', 'de-DE', 'fr'), 'en');
        assert.strictEqual(resolveUiLanguage('auto', '', ''), 'en');
    });

    test('an unsupported explicit language degrades to English rather than throwing', () => {
        assert.strictEqual(resolveUiLanguage('de', 'ru-RU', 'ru'), 'en');
    });

    test('case and underscore separators are tolerated', () => {
        assert.strictEqual(resolveUiLanguage('AUTO', 'RU_ru', 'en'), 'ru');
        assert.strictEqual(resolveUiLanguage('  Ru  ', 'en-US', 'en'), 'ru');
    });
});

suite('pluralIndex', () => {
    test('English selects singular only for exactly one', () => {
        assert.deepStrictEqual(
            [0, 1, 2, 21].map((n) => pluralIndex(n, 'en')),
            [1, 0, 1, 1]
        );
    });

    test('Russian applies the last-digit rule with the 11-14 exception', () => {
        // задача / задачи / задач
        const forms = [1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111];
        assert.deepStrictEqual(
            forms.map((n) => pluralIndex(n, 'ru')),
            [0, 1, 2, 2, 2, 2, 0, 1, 2, 0, 2]
        );
        assert.strictEqual(pluralIndex(0, 'ru'), 2);
    });

    test('an unknown language uses the English rule', () => {
        assert.strictEqual(pluralIndex(1, 'de'), 0);
        assert.strictEqual(pluralIndex(3, 'de'), 1);
    });
});

suite('formatString', () => {
    test('substitutes positional placeholders', () => {
        assert.strictEqual(formatString('Switch to {0} view', 'Week'), 'Switch to Week view');
        assert.strictEqual(
            formatString('Repeating{0} — next {1}', ' (++7d)', '28.07.2026'),
            'Repeating (++7d) — next 28.07.2026'
        );
    });

    test('a missing value leaves its placeholder rather than printing undefined', () => {
        assert.strictEqual(formatString('Tag: {0}'), 'Tag: {0}');
    });

    test('an empty template yields an empty string', () => {
        assert.strictEqual(formatString(''), '');
    });
});

suite('AGENDA_STRINGS', () => {
    // A missing key would render as `undefined` in the webview, so the two
    // dictionaries must stay structurally identical.
    function shape(value: unknown): unknown {
        if (Array.isArray(value)) {
            return 'array';
        }
        if (value && typeof value === 'object') {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(value).sort()) {
                out[key] = shape((value as Record<string, unknown>)[key]);
            }
            return out;
        }
        return typeof value;
    }

    test('every supported language has a dictionary', () => {
        for (const lang of UI_LANGUAGES) {
            assert.ok(AGENDA_STRINGS[lang], `no dictionary for ${lang}`);
        }
    });

    test('the Russian dictionary mirrors the English one key for key', () => {
        assert.deepStrictEqual(shape(AGENDA_STRINGS.ru), shape(AGENDA_STRINGS.en));
    });

    test('no string is left empty', () => {
        const walk = (value: unknown, path: string): void => {
            if (typeof value === 'string') {
                assert.ok(value.length > 0, `empty string at ${path}`);
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((item, i) => {
                    walk(item, `${path}[${i}]`);
                });
                return;
            }
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                walk(child, `${path}.${key}`);
            }
        };
        for (const lang of UI_LANGUAGES) {
            walk(AGENDA_STRINGS[lang], lang);
        }
    });

    test('Russian counted nouns carry all three plural forms', () => {
        assert.strictEqual(AGENDA_STRINGS.ru.summary.tasks.length, 3);
        assert.strictEqual(AGENDA_STRINGS.ru.countChip.tasks.length, 3);
        assert.strictEqual(AGENDA_STRINGS.en.summary.tasks.length, 2);
    });

    /** Walk both dictionaries in step, visiting each (path, en, ru) leaf pair. */
    function walkPairs(
        en: unknown,
        ru: unknown,
        path: string,
        visit: (path: string, en: unknown, ru: unknown) => void
    ): void {
        if (typeof en === 'string' || Array.isArray(en)) {
            visit(path, en, ru);
            return;
        }
        for (const key of Object.keys(en as Record<string, unknown>)) {
            walkPairs(
                (en as Record<string, unknown>)[key],
                (ru as Record<string, unknown>)[key],
                `${path}.${key}`,
                visit
            );
        }
    }

    // Dropping `{0}` from a translation does not throw: formatString simply
    // finds no placeholder and the value silently disappears from the message.
    // Comparing the placeholder sets catches that, and keeps catching it for
    // strings added later -- the named tests above only cover today's keys.
    test('a translated string uses the same placeholders as its English original', () => {
        const placeholders = (value: string): string[] => (value.match(/\{\d+\}/g) ?? []).sort();
        walkPairs(AGENDA_STRINGS.en, AGENDA_STRINGS.ru, 'strings', (path, en, ru) => {
            if (typeof en !== 'string' || typeof ru !== 'string') {
                return;
            }
            assert.deepStrictEqual(
                placeholders(ru),
                placeholders(en),
                `placeholder mismatch at ${path}: "${en}" vs "${ru}"`
            );
        });
    });

    // A counted noun is indexed with pluralIndex, so a list shorter than the
    // number of forms that language can ask for renders as "5 undefined".
    test('every counted noun has a form for each index pluralIndex can return', () => {
        for (const lang of UI_LANGUAGES) {
            const required = new Set<number>();
            for (let n = 0; n <= 100; n++) {
                required.add(pluralIndex(n, lang));
            }
            const needed = Math.max(...required) + 1;
            walkPairs(AGENDA_STRINGS.en, AGENDA_STRINGS[lang], 'strings', (path, _en, forms) => {
                if (!Array.isArray(forms)) {
                    return;
                }
                assert.strictEqual(
                    forms.length,
                    needed,
                    `${lang}${path.replace('strings', '')} has ${forms.length} forms, needs ${needed}`
                );
            });
        }
    });
});
