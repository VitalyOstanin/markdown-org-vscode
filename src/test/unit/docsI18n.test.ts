import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { DOCS_STRINGS } from '../../utils/docsI18n';

/**
 * The chrome around the help pages (#181). The pages themselves are files a
 * missing translation falls back on page by page; these strings have no such
 * fallback, so a language left with an English word here would show it.
 */
suite('Help panel strings', () => {
    const FIELDS = ['title', 'contents', 'searchPlaceholder', 'hitsTitle', 'noHits'] as const;

    test('both languages the extension speaks are covered', () => {
        assert.deepStrictEqual(Object.keys(DOCS_STRINGS).sort(), ['en', 'ru']);
    });

    for (const language of ['en', 'ru'] as const) {
        test(`the ${language} strings are all present and non-empty`, () => {
            const strings = DOCS_STRINGS[language];
            const empty = FIELDS.filter((field) => strings[field].trim() === '');
            assert.deepStrictEqual(empty, [], `empty ${language} strings`);
        });
    }

    test('the Russian strings are translated, not copied', () => {
        const same = FIELDS.filter((field) => DOCS_STRINGS.ru[field] === DOCS_STRINGS.en[field]);
        assert.deepStrictEqual(same, [], 'a Russian string was left at its English text');
    });

    test('the panel names the extension in its title, as the agenda does', () => {
        for (const language of ['en', 'ru'] as const) {
            assert.ok(DOCS_STRINGS[language].title.includes('Markdown Org'));
        }
    });
});
