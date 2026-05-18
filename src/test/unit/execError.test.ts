import * as assert from 'assert';
import { suite, test } from 'mocha';
import { buildExecError } from '../../utils/execError';

interface FakeExecException extends Error {
    code?: number | string;
}

function makeExecException(message: string, code?: number | string): FakeExecException {
    const err: FakeExecException = new Error(message);
    if (code !== undefined) {
        err.code = code;
    }
    return err;
}

suite('execError.buildExecError', () => {
    test('uses stderr when non-empty', () => {
        const original = makeExecException('child exited with code 1', 1);
        const err = buildExecError(original, 'something went wrong on stderr', 'fallback');
        assert.strictEqual(err.message, 'something went wrong on stderr');
    });

    test('falls back to error.message when stderr is empty', () => {
        const original = makeExecException('child exited with code 1', 1);
        const err = buildExecError(original, '', 'fallback');
        assert.strictEqual(err.message, 'child exited with code 1');
    });

    test('falls back to the supplied default when both stderr and error.message are empty', () => {
        const original = makeExecException('', 1);
        const err = buildExecError(original, '', 'fallback');
        assert.strictEqual(err.message, 'fallback');
    });

    test('attaches the original error via cause when provided', () => {
        const original = makeExecException('child exited with code 1', 1);
        const err = buildExecError(original, 'stderr text', 'fallback');
        assert.strictEqual(err.cause, original);
        assert.strictEqual((err.cause as FakeExecException).code, 1);
    });

    test('omits cause when no original error is provided (e.g. timeout path)', () => {
        const err = buildExecError(null, '', 'timeout fallback');
        assert.strictEqual(err.message, 'timeout fallback');
        assert.strictEqual(err.cause, undefined);
    });
});
