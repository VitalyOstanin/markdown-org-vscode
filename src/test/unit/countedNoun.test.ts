import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { countedNoun } from '../../utils/countedNoun';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';

/**
 * The counted noun of a host notification. Both halves matter and they come
 * from two different settings: the noun agrees with `uiLanguage`, the digits
 * follow `dateLocale` -- which is the rule the panel already renders by.
 */
suite('countedNoun', () => {
    test('the digits follow the date locale, as the button that raised this does', () => {
        // The defect this covers: pressing "Commit ٣" was answered with
        // "Committed 3 files" -- one action, two numbering systems.
        assert.equal(countedNoun(3, AGENDA_STRINGS.en.git.files, 'en', 'ar-EG'), '٣ files');
        assert.equal(countedNoun(3, AGENDA_STRINGS.en.git.files, 'en', 'en-US'), '3 files');
    });

    test('the noun agrees by the interface language, not by the locale', () => {
        const files = AGENDA_STRINGS.ru.git.files;
        assert.equal(countedNoun(1, files, 'ru', 'en-US'), '1 файл');
        assert.equal(countedNoun(3, files, 'ru', 'en-US'), '3 файла');
        assert.equal(countedNoun(5, files, 'ru', 'en-US'), '5 файлов');
    });

    test('a form the dictionary does not have leaves the number alone', () => {
        // Rather than "3 undefined": the count is the part that carries the
        // meaning, and a dictionary short of a form is a bug to be seen, not
        // a message to be broken.
        assert.equal(countedNoun(3, [], 'en', 'en-US'), '3');
    });
});
