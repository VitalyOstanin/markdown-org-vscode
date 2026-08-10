import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { resolveAgendaDirectories } from '../../utils/agendaDirectories';

suite('agendaDirectories.resolveAgendaDirectories', () => {
    test('the list is what gets scanned when it has entries', () => {
        assert.deepStrictEqual(resolveAgendaDirectories(['/notes/work', '/notes/home'], '/abs/org', '/abs/workspace'), [
            '/notes/work',
            '/notes/home'
        ]);
    });

    test('the single-directory setting still wins over the workspace folder', () => {
        assert.deepStrictEqual(resolveAgendaDirectories(undefined, '/abs/org', '/abs/workspace'), ['/abs/org']);
        assert.deepStrictEqual(resolveAgendaDirectories([], '/abs/org', '/abs/workspace'), ['/abs/org']);
    });

    test('an empty string is how VS Code stores "not set"', () => {
        assert.deepStrictEqual(resolveAgendaDirectories([], '', '/abs/workspace'), ['/abs/workspace']);
        assert.deepStrictEqual(resolveAgendaDirectories(['', '   '], '', '/abs/workspace'), ['/abs/workspace']);
    });

    test('nothing configured and no folder open leaves nothing to scan', () => {
        assert.deepStrictEqual(resolveAgendaDirectories(undefined, undefined, undefined), []);
        assert.deepStrictEqual(resolveAgendaDirectories([], '', undefined), []);
    });

    test('the same directory twice would double every task, so it collapses', () => {
        assert.deepStrictEqual(resolveAgendaDirectories(['/notes', '/notes', ' /notes '], undefined, undefined), [
            '/notes'
        ]);
    });

    test('a list entry that is not a string never reaches the extractor', () => {
        // settings.json accepts anything JSON allows; a number would otherwise
        // be stringified into a `--dir` argument.
        const dirs = ['/notes', 42, null] as unknown as string[];
        assert.deepStrictEqual(resolveAgendaDirectories(dirs, undefined, '/abs/workspace'), ['/notes']);
    });
});
