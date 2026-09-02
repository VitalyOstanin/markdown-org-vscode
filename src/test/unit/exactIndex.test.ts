import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { at } from '../../utils/exactIndex';

suite('at', () => {
    test('an element that is there is returned as it stands', () => {
        assert.strictEqual(at(['Вс', 'Пн', 'Вт'], 2, 'weekday'), 'Вт');
    });

    test('a table that lost the entry throws, naming what was looked up', () => {
        // The point of the helper: an index past the end is a table that is
        // wrong, and a fallback value would carry that on silently.
        assert.throws(() => at(['Вс', 'Пн'], 5, 'weekday'), /no weekday at index 5 of 2/);
    });

    test('a lookup with nothing said about it is named as an element', () => {
        assert.throws(() => at([], 0), /no element at index 0 of 0/);
    });
});
