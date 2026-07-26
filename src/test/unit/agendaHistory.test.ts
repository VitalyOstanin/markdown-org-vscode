import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { AgendaHistory } from '../../utils/agendaHistory';

suite('AgendaHistory', () => {
    test('starts empty: no back, no forward, no current', () => {
        const h = new AgendaHistory();
        assert.strictEqual(h.canGoBack(), false);
        assert.strictEqual(h.canGoForward(), false);
        assert.strictEqual(h.current(), undefined);
        assert.strictEqual(h.length, 0);
    });

    test('records states and walks back/forward like a browser', () => {
        const h = new AgendaHistory();
        h.record({ mode: 'week', date: '2025-12-09' });
        h.record({ mode: 'day', date: '2025-12-11' });
        h.record({ mode: 'month', date: '2025-12-11' });

        assert.strictEqual(h.length, 3);
        assert.deepStrictEqual(h.current(), { mode: 'month', date: '2025-12-11' });
        assert.strictEqual(h.canGoForward(), false);

        assert.deepStrictEqual(h.back(), { mode: 'day', date: '2025-12-11' });
        assert.deepStrictEqual(h.back(), { mode: 'week', date: '2025-12-09' });
        assert.strictEqual(h.canGoBack(), false);
        assert.strictEqual(h.back(), undefined, 'back at the start returns undefined');

        assert.deepStrictEqual(h.forward(), { mode: 'day', date: '2025-12-11' });
        assert.deepStrictEqual(h.forward(), { mode: 'month', date: '2025-12-11' });
        assert.strictEqual(h.forward(), undefined, 'forward at the end returns undefined');
    });

    test('record de-duplicates an identical current state', () => {
        const h = new AgendaHistory();
        assert.strictEqual(h.record({ mode: 'week', date: '2025-12-09' }), true);
        // Passive refresh / repeat lands on the same state -> not recorded.
        assert.strictEqual(h.record({ mode: 'week', date: '2025-12-09' }), false);
        assert.strictEqual(h.length, 1);
    });

    test('a differing date on the same mode is a distinct state', () => {
        const h = new AgendaHistory();
        h.record({ mode: 'week', date: '2025-12-09' });
        assert.strictEqual(h.record({ mode: 'week', date: '2025-12-16' }), true);
        assert.strictEqual(h.length, 2);
    });

    test('recording after going back drops the forward tail (new branch)', () => {
        const h = new AgendaHistory();
        h.record({ mode: 'week', date: '2025-12-09' });
        h.record({ mode: 'day', date: '2025-12-10' });
        h.record({ mode: 'month', date: '2025-12-10' });

        h.back(); // -> day 10
        h.back(); // -> week 09
        assert.deepStrictEqual(h.current(), { mode: 'week', date: '2025-12-09' });

        // New navigation from here replaces the [day, month] tail.
        h.record({ mode: 'tasks', date: '2025-12-09' });
        assert.strictEqual(h.length, 2);
        assert.strictEqual(h.canGoForward(), false);
        assert.deepStrictEqual(h.current(), { mode: 'tasks', date: '2025-12-09' });
    });

    test('re-recording the current state after going back does not truncate', () => {
        // Guards the replay path: navigating Back sets cursor to the target,
        // then the re-render records that same state -> must be a no-op, not a
        // truncation that wipes the forward tail.
        const h = new AgendaHistory();
        h.record({ mode: 'week', date: '2025-12-09' });
        h.record({ mode: 'day', date: '2025-12-10' });
        const target = h.back(); // -> week 09, cursor at 0
        assert.deepStrictEqual(target, { mode: 'week', date: '2025-12-09' });

        assert.strictEqual(h.record(target), false, 'replay of the current state is a no-op');
        assert.strictEqual(h.length, 2, 'forward tail survives');
        assert.strictEqual(h.canGoForward(), true);
    });

    test('clear resets everything', () => {
        const h = new AgendaHistory();
        h.record({ mode: 'week', date: '2025-12-09' });
        h.record({ mode: 'day', date: '2025-12-10' });
        h.clear();
        assert.strictEqual(h.length, 0);
        assert.strictEqual(h.canGoBack(), false);
        assert.strictEqual(h.current(), undefined);
    });
});
