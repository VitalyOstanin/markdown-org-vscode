import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { KIND_COLORS, KIND_WEIGHTS, TIMESTAMP_KINDS } from '../../utils/orgHighlightPalette';
import type { HighlightKind } from '../../utils/orgHighlightSpans';
import { computeHighlightSpans } from '../../utils/orgHighlightSpans';

/** A planning line carrying every part a timestamp can hold. */
const WHOLE_TIMESTAMP = '`SCHEDULED: <2026-03-03 Tue 10:00 +7d -2d>`';

suite('the editor palette', () => {
    test('every kind the spans produce has a colour', () => {
        const painted = new Set<HighlightKind>(computeHighlightSpans(WHOLE_TIMESTAMP).map((span) => span.kind));
        const uncoloured = [...painted].filter((kind) => !KIND_COLORS[kind]);

        assert.deepStrictEqual(uncoloured, []);
    });

    test('the parts of a timestamp are the ones the spans find in it', () => {
        const found = new Set(computeHighlightSpans(WHOLE_TIMESTAMP).map((span) => span.kind));

        assert.deepStrictEqual(
            TIMESTAMP_KINDS.filter((kind) => !found.has(kind)),
            [],
            'TIMESTAMP_KINDS names a part no timestamp holds'
        );
    });

    /**
     * Markdown reads the planning line as inline code, so the theme paints the
     * run under the decorations and is free to choose a colour close to one of
     * ours. Yellow is the one that collides -- Monokai puts inline code at
     * `#FD971F` against a `charts.yellow` of `#CCA700` -- and a part that
     * cannot be told apart by colour has to be told apart another way.
     */
    test('a yellow part of a timestamp carries weight as well', () => {
        const unmarked = TIMESTAMP_KINDS.filter((kind) => KIND_COLORS[kind] === 'charts.yellow' && !KIND_WEIGHTS[kind]);

        assert.deepStrictEqual(unmarked, [], 'these read as the surrounding line on a theme whose inline code is warm');
    });
});
