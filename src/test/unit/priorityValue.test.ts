import * as assert from 'node:assert';
import { parsePriorityValue } from '../../utils/priorityValue';

// The accepted set mirrors the extractor's `Priority::parse`: a letter A-Z or
// a number 0..64. Anything else is text there, so writing it as a cookie would
// produce a heading whose priority the agenda does not show.
suite('parsePriorityValue', () => {
    test('takes a letter as typed', () => {
        assert.strictEqual(parsePriorityValue('A'), 'A');
        assert.strictEqual(parsePriorityValue('Z'), 'Z');
    });

    test('upper-cases a letter typed in lower case', () => {
        assert.strictEqual(parsePriorityValue('b'), 'B');
    });

    test('takes a number inside the range', () => {
        assert.strictEqual(parsePriorityValue('0'), '0');
        assert.strictEqual(parsePriorityValue('12'), '12');
        assert.strictEqual(parsePriorityValue('64'), '64');
    });

    test('refuses a number past the range', () => {
        assert.strictEqual(parsePriorityValue('65'), undefined);
        assert.strictEqual(parsePriorityValue('100'), undefined);
    });

    test('drops a leading zero rather than writing a cookie nothing reads', () => {
        // `[#01]` is text to the extractor; `[#1]` is the priority meant.
        assert.strictEqual(parsePriorityValue('01'), '1');
    });

    test('accepts the cookie as it appears on the heading', () => {
        assert.strictEqual(parsePriorityValue('[#A]'), 'A');
        assert.strictEqual(parsePriorityValue(' [#12] '), '12');
    });

    test('refuses what is not a priority', () => {
        assert.strictEqual(parsePriorityValue(''), undefined);
        assert.strictEqual(parsePriorityValue('   '), undefined);
        assert.strictEqual(parsePriorityValue('AA'), undefined);
        assert.strictEqual(parsePriorityValue('-1'), undefined);
        assert.strictEqual(parsePriorityValue('1.5'), undefined);
        assert.strictEqual(parsePriorityValue('high'), undefined);
    });
});
