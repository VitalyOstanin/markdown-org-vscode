import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { KeyedResolutionCache } from '../../utils/keyedResolutionCache';

/**
 * The cache that keeps the agenda's git status from spawning a `git` process
 * per file. What it has to hold: one answer per key however many callers ask,
 * including callers that ask while the first answer is still on its way, and a
 * remembered "no" -- the negative answer is the expensive one, since it is the
 * one that reached `git rev-parse` and came back empty.
 */
suite('KeyedResolutionCache', () => {
    test('one computation per key, however many times it is asked', async () => {
        let runs = 0;
        const cache = new KeyedResolutionCache<string>();
        const compute = () => {
            runs++;
            return Promise.resolve('repo');
        };

        assert.equal(await cache.resolve('/a', compute), 'repo');
        assert.equal(await cache.resolve('/a', compute), 'repo');
        assert.equal(runs, 1);

        assert.equal(await cache.resolve('/b', compute), 'repo');
        assert.equal(runs, 2, 'a different key is a different answer');
    });

    test('a "not found" answer is remembered too', async () => {
        // This is the case worth caching: it is the one that ran `git
        // rev-parse` and got nothing back, and every later file of the same
        // directory would run it again.
        let runs = 0;
        const cache = new KeyedResolutionCache<string | undefined>();
        const compute = () => {
            runs++;
            return Promise.resolve(undefined);
        };

        assert.equal(await cache.resolve('/a', compute), undefined);
        assert.equal(await cache.resolve('/a', compute), undefined);
        assert.equal(runs, 1);
    });

    test('callers that arrive while the answer is on its way share it', async () => {
        // The status pass walks its files without waiting for each other, so
        // two files of one directory can be in flight at once; storing the
        // promise rather than the value is what keeps that to one process.
        let runs = 0;
        const held = Promise.withResolvers<string>();
        const cache = new KeyedResolutionCache<string>();
        const compute = () => {
            runs++;
            return held.promise;
        };

        const first = cache.resolve('/a', compute);
        const second = cache.resolve('/a', compute);
        held.resolve('repo');

        assert.deepEqual(await Promise.all([first, second]), ['repo', 'repo']);
        assert.equal(runs, 1);
    });

    test('a failed computation is not what the next caller gets', async () => {
        let runs = 0;
        const cache = new KeyedResolutionCache<string>();
        const compute = () => {
            runs++;
            return runs === 1 ? Promise.reject(new Error('git is gone')) : Promise.resolve('repo');
        };

        await assert.rejects(() => cache.resolve('/a', compute), /git is gone/);
        assert.equal(await cache.resolve('/a', compute), 'repo', 'the failure was not cached');
        assert.equal(runs, 2);
    });

    test('a failure that lands after clear() leaves the newer answer alone', async () => {
        // The panel clears the cache on every repository event, so a slow
        // failure can come back to a key that has since been answered again.
        // Deleting by key alone would throw that answer away and cost another
        // `git rev-parse` for a directory already resolved.
        let runs = 0;
        const slow = Promise.withResolvers<string>();
        const cache = new KeyedResolutionCache<string>();
        const compute = () => {
            runs++;
            return runs === 1 ? slow.promise : Promise.resolve('repo');
        };

        const failing = cache.resolve('/a', compute);
        cache.clear();
        const replacement = cache.resolve('/a', compute);
        slow.reject(new Error('git is gone'));

        await assert.rejects(() => failing, /git is gone/);
        assert.equal(await replacement, 'repo');
        assert.equal(await cache.resolve('/a', compute), 'repo', 'the newer entry survived the older failure');
        assert.equal(runs, 2);
    });

    test('clear() forgets everything, which is what a repository event means', async () => {
        let runs = 0;
        const cache = new KeyedResolutionCache<string>();
        const compute = () => {
            runs++;
            return Promise.resolve('repo');
        };

        await cache.resolve('/a', compute);
        cache.clear();
        await cache.resolve('/a', compute);
        assert.equal(runs, 2);
    });
});
