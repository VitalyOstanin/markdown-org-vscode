import * as assert from 'assert';
import { suite, test } from 'mocha';
import { formatError } from '../../utils/formatError';

suite('formatError', () => {
    test('returns message from Error instances', () => {
        assert.strictEqual(formatError(new Error('boom')), 'boom');
    });

    test('returns message from Error subclasses (TypeError, SyntaxError)', () => {
        assert.strictEqual(formatError(new TypeError('bad type')), 'bad type');
        assert.strictEqual(formatError(new SyntaxError('bad syntax')), 'bad syntax');
    });

    test('falls back to String() for non-Error values', () => {
        assert.strictEqual(formatError('plain string'), 'plain string');
        assert.strictEqual(formatError(42), '42');
        assert.strictEqual(formatError(null), 'null');
        assert.strictEqual(formatError(undefined), 'undefined');
    });

    test('avoids "[object Object]" via toString for plain objects with a toString', () => {
        const o = { toString: () => 'custom toString' };
        assert.strictEqual(formatError(o), 'custom toString');
    });

    test('renders plain objects without custom toString as [object Object]', () => {
        // Documented limitation: there isn't a useful message to extract;
        // returning the same string the default template would produce is
        // acceptable because the user-facing prefix still identifies the
        // failing operation.
        assert.strictEqual(formatError({}), '[object Object]');
    });
});
