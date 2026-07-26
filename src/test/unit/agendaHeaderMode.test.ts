import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    COMPACT_HEADER_MAX_HEIGHT,
    nextHeaderMode,
    normalizeHeaderMode,
    resolveHeaderLayout
} from '../../utils/agendaHeaderMode';

// `markdown-org.agendaHeaderMode` picks the agenda header layout. The resolver
// is inlined into the webview, where it decides a single class on <body>, so a
// wrong answer either wastes a fifth of a short panel on chrome or shrinks the
// header on a panel that had room for it.
suite('normalizeHeaderMode', () => {
    test('accepts the three documented values', () => {
        assert.strictEqual(normalizeHeaderMode('auto'), 'auto');
        assert.strictEqual(normalizeHeaderMode('full'), 'full');
        assert.strictEqual(normalizeHeaderMode('compact'), 'compact');
    });

    test('falls back to auto for anything else', () => {
        // A hand-edited settings.json, or a value from an older/newer version
        // of the extension.
        assert.strictEqual(normalizeHeaderMode(undefined), 'auto');
        assert.strictEqual(normalizeHeaderMode(''), 'auto');
        assert.strictEqual(normalizeHeaderMode('Compact'), 'auto');
        assert.strictEqual(normalizeHeaderMode('tiny'), 'auto');
    });
});

suite('resolveHeaderLayout', () => {
    test('pinned modes ignore the viewport', () => {
        assert.strictEqual(resolveHeaderLayout('full', 200), 'full');
        assert.strictEqual(resolveHeaderLayout('compact', 2000), 'compact');
    });

    test('auto follows the panel height around the threshold', () => {
        assert.strictEqual(resolveHeaderLayout('auto', COMPACT_HEADER_MAX_HEIGHT - 1), 'compact');
        // The threshold itself is compact: at that height the full header is
        // already about a fifth of the panel.
        assert.strictEqual(resolveHeaderLayout('auto', COMPACT_HEADER_MAX_HEIGHT), 'compact');
        assert.strictEqual(resolveHeaderLayout('auto', COMPACT_HEADER_MAX_HEIGHT + 1), 'full');
    });

    test('an unmeasured viewport resolves to full', () => {
        // A panel that has not been laid out yet reports 0 (and, in a webview
        // that is being restored, sometimes NaN). Resolving those to compact
        // would open the panel small and then jump on the first resize.
        assert.strictEqual(resolveHeaderLayout('auto', 0), 'full');
        assert.strictEqual(resolveHeaderLayout('auto', -100), 'full');
        assert.strictEqual(resolveHeaderLayout('auto', NaN), 'full');
        assert.strictEqual(resolveHeaderLayout('auto', Infinity), 'full');
    });

    test('a non-numeric height resolves to full instead of being coerced', () => {
        // The caller is the webview, where the height comes from the DOM and is
        // not type-checked. A numeric string would pass the global `isFinite`
        // and then compare as a number; it is treated as "not measured".
        assert.strictEqual(resolveHeaderLayout('auto', '400' as unknown as number), 'full');
    });

    test('an unknown mode behaves like auto', () => {
        assert.strictEqual(resolveHeaderLayout('tiny', 400), 'compact');
        assert.strictEqual(resolveHeaderLayout(undefined, 900), 'full');
    });

    suite('measured header height decides the layout', () => {
        // The threshold was always meant as "the header eats too much of the
        // panel", and the page measures the header on every resize anyway. With
        // the measurement in hand the decision is the ratio itself, so a large
        // editor font (which makes the header taller) switches to compact on a
        // panel where a small font would not.
        test('a header taking a fifth of a tall panel still switches to compact', () => {
            assert.strictEqual(resolveHeaderLayout('auto', 900, { headerHeight: 200, current: 'full' }), 'compact');
        });

        test('a small header on a short panel stays full', () => {
            assert.strictEqual(resolveHeaderLayout('auto', 480, { headerHeight: 60, current: 'full' }), 'full');
        });

        test('hysteresis: the layout holds in the band between the two ratios', () => {
            // 17% of the panel: above the exit ratio, below the entry one --
            // whichever layout is on stays on, so dragging the editor split
            // across the boundary does not flip it back and forth.
            assert.strictEqual(resolveHeaderLayout('auto', 1000, { headerHeight: 170, current: 'full' }), 'full');
            assert.strictEqual(resolveHeaderLayout('auto', 1000, { headerHeight: 170, current: 'compact' }), 'compact');
        });

        test('the compact layout holds while the full header would still be too tall', () => {
            // The height passed in is always the full header's, so a panel that
            // switched to compact keeps it: re-deciding from the compact
            // header's own (much smaller) share would return the panel to full
            // on the next recompute, then to compact, once per resize event.
            const vh = 625;
            const fullHeader = 160;
            let layout: 'full' | 'compact' = 'full';
            const seen: string[] = [];
            for (let i = 0; i < 4; i++) {
                layout = resolveHeaderLayout('auto', vh, { headerHeight: fullHeader, current: layout });
                seen.push(layout);
            }
            assert.deepStrictEqual(seen, ['compact', 'compact', 'compact', 'compact']);
        });

        test('an unmeasured header falls back to the fixed panel-height threshold', () => {
            assert.strictEqual(resolveHeaderLayout('auto', 400, { headerHeight: 0, current: 'full' }), 'compact');
            assert.strictEqual(resolveHeaderLayout('auto', 900, { headerHeight: 0, current: 'full' }), 'full');
        });

        test('a pinned mode ignores the measurement', () => {
            assert.strictEqual(resolveHeaderLayout('full', 300, { headerHeight: 200, current: 'compact' }), 'full');
            assert.strictEqual(resolveHeaderLayout('compact', 2000, { headerHeight: 10, current: 'full' }), 'compact');
        });
    });

    test('the fallback threshold is overridable for callers that measure differently', () => {
        assert.strictEqual(resolveHeaderLayout('auto', 700, { threshold: 800 }), 'compact');
        assert.strictEqual(resolveHeaderLayout('auto', 700, { threshold: 600 }), 'full');
    });
});

// The button in the agenda control row and the "Cycle Agenda Header Layout"
// command both step through this. It runs inside the webview as well, where
// only the function's own source travels.
suite('nextHeaderMode', () => {
    test('steps auto -> full -> compact -> auto', () => {
        assert.strictEqual(nextHeaderMode('auto'), 'full');
        assert.strictEqual(nextHeaderMode('full'), 'compact');
        assert.strictEqual(nextHeaderMode('compact'), 'auto');
    });

    test('an unset or unknown value is treated as auto', () => {
        // Same inputs normalizeHeaderMode maps to 'auto', so the cycle starts
        // where the settings editor says it does.
        for (const value of [undefined, '', 'tiny', 'AUTO']) {
            assert.strictEqual(normalizeHeaderMode(value), 'auto');
            assert.strictEqual(nextHeaderMode(value), 'full', `value: ${String(value)}`);
        }
    });

    test('three steps return to where they started, from any value', () => {
        for (const start of ['auto', 'full', 'compact']) {
            assert.strictEqual(nextHeaderMode(nextHeaderMode(nextHeaderMode(start))), start);
        }
    });

    test('the source carries no call to a sibling helper', () => {
        // It is inlined into the page by `.toString()`, which brings no module
        // bindings along: a call to normalizeHeaderMode would be an undefined
        // name there and the page would die on load. The duplicated
        // normalisation above is what the two previous tests pin.
        assert.ok(
            !nextHeaderMode.toString().includes('normalizeHeaderMode'),
            'nextHeaderMode is inlined into the webview and must not call another module-level function'
        );
    });
});
