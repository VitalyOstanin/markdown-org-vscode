import * as assert from 'assert';
import { suite, test } from 'mocha';
import { buildCommandErrorMessage, withErrorReporting } from '../../utils/orgCommandWrap';

suite('orgCommandWrap.buildCommandErrorMessage', () => {
    test('strips the markdown-org. command prefix from the user-facing message', () => {
        const msg = buildCommandErrorMessage('markdown-org.setTodo', new Error('boom'));
        assert.strictEqual(msg, 'setTodo failed: boom');
    });

    test('keeps the full command name when there is no recognised prefix', () => {
        const msg = buildCommandErrorMessage('something.else', new Error('boom'));
        assert.strictEqual(msg, 'something.else failed: boom');
    });

    test('formats non-Error throwables via the same fallback as formatError', () => {
        assert.strictEqual(buildCommandErrorMessage('markdown-org.x', 'just string'), 'x failed: just string');
        assert.strictEqual(buildCommandErrorMessage('markdown-org.x', 42), 'x failed: 42');
    });
});

suite('orgCommandWrap.withErrorReporting', () => {
    test('returns the handler value when the handler resolves', async () => {
        const collected: string[] = [];
        const wrapped = withErrorReporting<[], number>(
            'markdown-org.x',
            (m) => collected.push(m),
            () => 42
        );
        assert.strictEqual(await wrapped(), 42);
        assert.deepStrictEqual(collected, []);
    });

    test('catches synchronous throws and reports a formatted message', async () => {
        const collected: string[] = [];
        const wrapped = withErrorReporting<[], void>(
            'markdown-org.x',
            (m) => collected.push(m),
            () => {
                throw new Error('boom');
            }
        );
        const result = await wrapped();
        assert.strictEqual(result, undefined);
        assert.deepStrictEqual(collected, ['x failed: boom']);
    });

    test('catches rejected Promises and reports a formatted message', async () => {
        const collected: string[] = [];
        const wrapped = withErrorReporting<[], void>(
            'markdown-org.x',
            (m) => collected.push(m),
            async () => {
                throw new Error('async boom');
            }
        );
        const result = await wrapped();
        assert.strictEqual(result, undefined);
        assert.deepStrictEqual(collected, ['x failed: async boom']);
    });

    test('passes all arguments through to the handler unchanged', async () => {
        const received: unknown[][] = [];
        const wrapped = withErrorReporting<[string, number], void>(
            'markdown-org.x',
            () => {},
            (...args) => {
                received.push(args);
            }
        );
        await wrapped('hello', 7);
        assert.deepStrictEqual(received, [['hello', 7]]);
    });
});
