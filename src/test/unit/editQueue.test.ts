import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { queueEdit } from '../../utils/editQueue';

/**
 * The queue that keeps a held key from losing its repeats.
 *
 * What matters is the order and that nothing is dropped: a task starts only
 * after the one before it has settled, and a task that throws does not take
 * the queue with it.
 */
suite('editQueue', () => {
    test('a task starts only after the one before it has finished', async () => {
        const order: string[] = [];
        const first = queueEdit(async () => {
            order.push('first in');
            await new Promise((resolve) => setTimeout(resolve, 10));
            order.push('first out');
        });
        const second = queueEdit(async () => {
            order.push('second in');
            return Promise.resolve();
        });

        await Promise.all([first, second]);

        assert.deepStrictEqual(order, ['first in', 'first out', 'second in']);
    });

    test('the caller gets its own result back', async () => {
        assert.strictEqual(await queueEdit(() => Promise.resolve(7)), 7);
    });

    test('a failing task is not the end of the queue', async () => {
        await assert.rejects(
            queueEdit(() => Promise.reject(new Error('refused'))),
            /refused/
        );

        assert.strictEqual(await queueEdit(() => Promise.resolve('after')), 'after');
    });
});
