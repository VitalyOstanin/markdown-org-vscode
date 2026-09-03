import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { KeyedSharedPass } from '../../utils/keyedSharedPass';

/**
 * The rule that keeps the agenda's git status to one pass per repository at a
 * time. What it has to hold: the pass runs once however many files ask for it,
 * everyone who asked is told how it went, and a pass that ends after the
 * repositories were forgotten does not take a newer pass down with it.
 */
suite('KeyedSharedPass', () => {
    test('one pass per key, however many callers ask while it runs', async () => {
        let starts = 0;
        const held = Promise.withResolvers<boolean>();
        const passes = new KeyedSharedPass();
        const start = () => {
            starts++;
            return held.promise;
        };

        const first = passes.run('/a', start);
        const second = passes.run('/a', start);
        held.resolve(true);

        assert.equal(await first, true);
        assert.equal(await second, true);
        assert.equal(starts, 1);
    });

    test('a caller that joined a failing pass is told it failed', async () => {
        // The one this exists for: the agenda marks a repository as primed
        // before its forced pass and takes it back out when the pass fails.
        // A joined caller told "it went fine" leaves the root primed over a
        // state that was never read, and the panel says "clean" over a dirty
        // tree until the repository is closed.
        const held = Promise.withResolvers<boolean>();
        const passes = new KeyedSharedPass();

        const first = passes.run('/a', () => held.promise);
        const second = passes.run('/a', () => held.promise);
        held.resolve(false);

        assert.equal(await first, false);
        assert.equal(await second, false, 'the joined caller sees the same outcome');
    });

    test('the next caller after a pass ends starts a new one', async () => {
        let starts = 0;
        const passes = new KeyedSharedPass();
        const start = () => {
            starts++;
            return Promise.resolve(true);
        };

        await passes.run('/a', start);
        await passes.run('/a', start);
        assert.equal(starts, 2, 'nothing is remembered once the pass is over');
    });

    test('a pass ending after clear() does not drop the pass that replaced it', async () => {
        // `clear()` runs when repositories are opened or closed, and a pass
        // started before it is still in flight: deleting by key alone would
        // take the entry of the pass started after it, and the next file of
        // that repository would run `git status` a second time.
        let starts = 0;
        const first = Promise.withResolvers<boolean>();
        const second = Promise.withResolvers<boolean>();
        const passes = new KeyedSharedPass();

        const firstRun = passes.run('/a', () => {
            starts++;
            return first.promise;
        });
        passes.clear();
        const secondRun = passes.run('/a', () => {
            starts++;
            return second.promise;
        });

        first.resolve(true);
        await firstRun;

        const joined = passes.run('/a', () => {
            starts++;
            return Promise.resolve(true);
        });
        second.resolve(true);

        assert.equal(await secondRun, true);
        assert.equal(await joined, true);
        assert.equal(starts, 2, 'the third caller joins the pass that is still running');
    });
});
