import * as assert from 'assert';
import { suite, test, setup, teardown } from 'mocha';
import * as sinon from 'sinon';
import { debounce } from '../../utils/debounce';

suite('debounce', () => {
    let clock: sinon.SinonFakeTimers;

    setup(() => {
        clock = sinon.useFakeTimers();
    });

    teardown(() => {
        clock.restore();
    });

    test('does not invoke fn before the delay elapses', () => {
        let calls = 0;
        const d = debounce(() => {
            calls++;
        }, 300);
        d();
        clock.tick(299);
        assert.strictEqual(calls, 0);
    });

    test('invokes fn once after the delay', () => {
        let calls = 0;
        const d = debounce(() => {
            calls++;
        }, 300);
        d();
        clock.tick(300);
        assert.strictEqual(calls, 1);
    });

    test('collapses a burst of calls into a single trailing invocation', () => {
        let calls = 0;
        const d = debounce(() => {
            calls++;
        }, 300);
        d();
        clock.tick(100);
        d();
        clock.tick(100);
        d();
        clock.tick(100);
        // 300ms of wall time passed, but each call reset the timer.
        assert.strictEqual(calls, 0);
        clock.tick(300);
        assert.strictEqual(calls, 1);
    });

    test('passes the latest arguments to fn', () => {
        const seen: string[] = [];
        const d = debounce((s: string) => {
            seen.push(s);
        }, 300);
        d('a');
        d('b');
        d('c');
        clock.tick(300);
        assert.deepStrictEqual(seen, ['c']);
    });

    test('separate calls after the delay each invoke fn', () => {
        let calls = 0;
        const d = debounce(() => {
            calls++;
        }, 300);
        d();
        clock.tick(300);
        d();
        clock.tick(300);
        assert.strictEqual(calls, 2);
    });

    test('cancel() prevents a pending invocation', () => {
        let calls = 0;
        const d = debounce(() => {
            calls++;
        }, 300);
        d();
        d.cancel();
        clock.tick(300);
        assert.strictEqual(calls, 0);
    });
});
