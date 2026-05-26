import * as assert from 'assert';
import { suite, test } from 'mocha';
import { isAdjustablePosition, shouldGateTimestampAdjust } from '../../utils/adjustablePosition';

/**
 * `isAdjustablePosition` mirrors the detection order inside
 * `adjustTimestamp` (timestampEdit.ts): a position is "adjustable" when
 * Shift+Up/Down would act on it (CLOCK part, timestamp part, timestamp
 * keyword outside the bracketed body, or a heading status/priority token)
 * rather than fall through to the built-in line selection. The context key
 * that gates the keybinding is computed from this predicate, so the two must
 * stay in sync.
 */
suite('isAdjustablePosition', () => {
    const SCHED = '`SCHEDULED: <2026-05-26 Tue 10:00>`';
    //            0123456789...               ^digits   ^...
    // 0: backtick, 1-9: SCHEDULED, 10: ':', 12: '<', 13-16: 2026

    test('true on a date digit inside an active timestamp', () => {
        assert.strictEqual(isAdjustablePosition(SCHED, 14), true);
    });

    test('true on the timestamp keyword token (cycles the keyword)', () => {
        assert.strictEqual(isAdjustablePosition(SCHED, 1), true);
    });

    test('true on the leading backtick (outside the bracket body -> keyword cycle)', () => {
        assert.strictEqual(isAdjustablePosition(SCHED, 0), true);
    });

    test('false inside the bracket body on a non-shiftable repeater token', () => {
        // `SCHEDULED: <2026-05-26 Tue +1d>`
        // body starts at 12; '+' of the repeater sits at column 28.
        const withRepeater = '`SCHEDULED: <2026-05-26 Tue +1d>`';
        assert.strictEqual(isAdjustablePosition(withRepeater, 28), false);
    });

    test('true on a CLOCK start date digit', () => {
        const clock = '`CLOCK: [2026-05-26 Tue 10:00]--[2026-05-26 Tue 11:00] =>  1:00`';
        // '[' at 8, year digits 9-12.
        assert.strictEqual(isAdjustablePosition(clock, 10), true);
    });

    test('true on a heading status token (TODO)', () => {
        const heading = '## TODO Buy milk';
        // '## ' = 0-2, TODO = 3-6.
        assert.strictEqual(isAdjustablePosition(heading, 4), true);
    });

    test('true on a heading priority cookie', () => {
        const heading = '## TODO [#A] Buy milk';
        // '[#A]' starts at 8.
        assert.strictEqual(isAdjustablePosition(heading, 9), true);
    });

    test('false on the heading title text', () => {
        const heading = '## TODO Buy milk';
        // 'Buy milk' starts at 8.
        assert.strictEqual(isAdjustablePosition(heading, 11), false);
    });

    test('false on a heading without status/priority', () => {
        const heading = '## Just a heading';
        assert.strictEqual(isAdjustablePosition(heading, 4), false);
    });

    test('false on a plain text line', () => {
        assert.strictEqual(isAdjustablePosition('Just some prose here', 5), false);
    });

    test('false on an empty line', () => {
        assert.strictEqual(isAdjustablePosition('', 0), false);
    });
});

suite('shouldGateTimestampAdjust', () => {
    const base = {
        languageId: 'markdown',
        selectionCount: 1,
        selectionEmpty: true,
        lineText: '`SCHEDULED: <2026-05-26 Tue 10:00>`',
        character: 14
    };

    test('true: single empty caret on an adjustable token in markdown', () => {
        assert.strictEqual(shouldGateTimestampAdjust(base), true);
    });

    test('false: non-markdown editor', () => {
        assert.strictEqual(shouldGateTimestampAdjust({ ...base, languageId: 'plaintext' }), false);
    });

    test('false: multiple carets', () => {
        assert.strictEqual(shouldGateTimestampAdjust({ ...base, selectionCount: 2 }), false);
    });

    test('false: non-empty selection (mid-selection over a timestamp must extend, not adjust)', () => {
        assert.strictEqual(shouldGateTimestampAdjust({ ...base, selectionEmpty: false }), false);
    });

    test('false: empty caret on a non-adjustable position', () => {
        assert.strictEqual(shouldGateTimestampAdjust({ ...base, lineText: 'just prose', character: 3 }), false);
    });
});
