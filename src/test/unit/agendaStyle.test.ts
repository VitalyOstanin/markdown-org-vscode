import * as assert from 'assert';
import { AGENDA_STYLES_LIST, DEFAULT_AGENDA_STYLE, normalizeAgendaStyle } from '../../utils/agendaStyle';

suite('agendaStyle', () => {
    test('default is hybrid', () => {
        assert.strictEqual(DEFAULT_AGENDA_STYLE, 'hybrid');
    });

    test('list is exactly the three presets', () => {
        assert.deepStrictEqual([...AGENDA_STYLES_LIST], ['monospace', 'native', 'hybrid']);
    });

    test('valid values pass through', () => {
        assert.strictEqual(normalizeAgendaStyle('monospace'), 'monospace');
        assert.strictEqual(normalizeAgendaStyle('native'), 'native');
        assert.strictEqual(normalizeAgendaStyle('hybrid'), 'hybrid');
    });

    test('unknown / empty / undefined fall back to default', () => {
        assert.strictEqual(normalizeAgendaStyle('garbage'), 'hybrid');
        assert.strictEqual(normalizeAgendaStyle(''), 'hybrid');
        assert.strictEqual(normalizeAgendaStyle(undefined), 'hybrid');
        assert.strictEqual(normalizeAgendaStyle(null as unknown as string), 'hybrid');
    });

    test('trims and lowercases before matching', () => {
        assert.strictEqual(normalizeAgendaStyle('  Hybrid '), 'hybrid');
        assert.strictEqual(normalizeAgendaStyle('NATIVE'), 'native');
    });
});
