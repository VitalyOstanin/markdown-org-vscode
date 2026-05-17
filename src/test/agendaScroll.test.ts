import * as assert from 'assert';
import { suite, test } from 'mocha';
import { rememberScroll, recallScroll, ScrollMemory } from '../utils/agendaScroll';

// These helpers are inlined into the agenda webview JS via `.toString()`,
// so unit-testing them in plain Node transitively covers the round-trip
// scroll behaviour (Next Week then Prev Week back to the current week,
// where without memory the user would be snapped to today's header).
suite('agendaScroll', () => {
    test('recallScroll on an unseen anchor returns null', () => {
        const history: ScrollMemory = {};
        assert.strictEqual(recallScroll(history, '2026-05-17'), null);
    });

    test('rememberScroll then recallScroll round-trips the value', () => {
        const history: ScrollMemory = {};
        rememberScroll(history, '2026-05-17', 420);
        assert.strictEqual(recallScroll(history, '2026-05-17'), 420);
    });

    test('zero scrollY is a valid remembered value (not confused with "no memory")', () => {
        // This is the actual user-reported bug: the user scrolled to the
        // top (scrollY = 0), navigated Next then Prev, and expected to
        // land back at 0 -- not at today's header.
        const history: ScrollMemory = {};
        rememberScroll(history, '2026-05-17', 0);
        assert.strictEqual(recallScroll(history, '2026-05-17'), 0);
    });

    test('rememberScroll overwrites the previous value for the same anchor', () => {
        const history: ScrollMemory = {};
        rememberScroll(history, '2026-05-17', 100);
        rememberScroll(history, '2026-05-17', 250);
        assert.strictEqual(recallScroll(history, '2026-05-17'), 250);
    });

    test('different anchors keep independent scroll positions', () => {
        const history: ScrollMemory = {};
        rememberScroll(history, '2026-05-17', 100);
        rememberScroll(history, '2026-05-24', 800);
        assert.strictEqual(recallScroll(history, '2026-05-17'), 100);
        assert.strictEqual(recallScroll(history, '2026-05-24'), 800);
    });

    test('rememberScroll with an empty anchor is a no-op', () => {
        // Webview state before init: the anchor string is empty. We must
        // not record a "" key, otherwise a later recallScroll('') would
        // claim a remembered position and the very first navigation
        // would silently bypass scrollToWeekFocus.
        const history: ScrollMemory = {};
        rememberScroll(history, '', 999);
        assert.deepStrictEqual(history, {});
    });

    test('recallScroll with an empty anchor returns null', () => {
        const history: ScrollMemory = { '': 999 };
        assert.strictEqual(recallScroll(history, ''), null);
    });

    test('recallScroll is safe against inherited Object.prototype keys', () => {
        // The anchor is an ISO date so collisions are unlikely, but the
        // helper uses hasOwnProperty.call to avoid surprises.
        const history: ScrollMemory = {};
        assert.strictEqual(recallScroll(history, 'toString'), null);
        assert.strictEqual(recallScroll(history, 'hasOwnProperty'), null);
    });

    test('Today drops the remembered scroll for the target anchor', () => {
        // Simulated user journey: open agenda week on 2026-05-17, scroll
        // to the top, Next Week, then Today. Today is an explicit
        // "snap to today" so it must NOT restore the old top-of-page
        // scroll for 2026-05-17 -- the caller deletes the entry, and
        // recallScroll then returns null so the webview falls back to
        // scrollToWeekFocus(). This locks in the v0.4.0 fix.
        const history: ScrollMemory = {};
        rememberScroll(history, '2026-05-17', 0);   // user was at top
        rememberScroll(history, '2026-05-24', 0);   // arrived at Next Week
        delete history['2026-05-17'];               // Today click resets target

        assert.strictEqual(recallScroll(history, '2026-05-17'), null,
            'Today must not restore the manual scroll on the current week');
    });

    test('Next-then-Prev round-trip restores the original scroll', () => {
        // Simulated user journey: open agenda week on 2026-05-17, scroll
        // to the top (scrollY = 0), Next Week (anchor jumps to
        // 2026-05-24), then Prev Week back to 2026-05-17.
        const history: ScrollMemory = {};

        // Before Next: anchor "2026-05-17", scrollY 0.
        rememberScroll(history, '2026-05-17', 0);

        // Before Prev: anchor "2026-05-24", scrollY 0 (fresh week).
        rememberScroll(history, '2026-05-24', 0);

        // Now we're back on 2026-05-17. The agenda webview asks: do we
        // have a remembered scroll for this anchor?
        const remembered = recallScroll(history, '2026-05-17');
        assert.strictEqual(remembered, 0, 'must restore scroll=0 (top), not snap to today');
    });
});
