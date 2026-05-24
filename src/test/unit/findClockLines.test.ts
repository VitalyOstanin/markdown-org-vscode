import * as assert from 'assert';
import { findClockLinesInLines } from '../../utils/findClockLines';

suite('findClockLinesInLines', () => {
    test('empty body after heading returns []', () => {
        const lines = ['## TODO Task', ''];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), []);
    });

    test('single CLOCK entry directly under heading', () => {
        const lines = ['## TODO Task', '`CLOCK: [2025-12-09 Tue 14:30]`'];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [1]);
    });

    test('TIMESTAMP lines before CLOCK are skipped', () => {
        const lines = [
            '## TODO Task',
            '`CREATED: [2025-12-09 Tue]`',
            '`SCHEDULED: <2025-12-10 Wed>`',
            '`CLOCK: [2025-12-09 Tue 14:30]--[2025-12-09 Tue 15:30] => 1:00`'
        ];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [3]);
    });

    test('multiple consecutive CLOCKs', () => {
        const lines = [
            '## TODO Task',
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`',
            '`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 15:00] => 1:00`',
            '`CLOCK: [2025-12-09 Tue 16:00]`'
        ];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [1, 2, 3]);
    });

    test('blank line *between* CLOCKs is accepted (continue)', () => {
        const lines = [
            '## TODO Task',
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`',
            '',
            '`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 15:00] => 1:00`'
        ];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [1, 3]);
    });

    test('several blank lines between CLOCKs still keep both', () => {
        const lines = [
            '## TODO Task',
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`',
            '',
            '',
            '',
            '`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 15:00] => 1:00`'
        ];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [1, 5]);
    });

    test('blank line *before* the first CLOCK terminates the search', () => {
        // Without an established CLOCK block, a blank line is treated as a
        // paragraph separator -- the function does not jump over arbitrary
        // gaps to find a CLOCK far below.
        const lines = ['## TODO Task', '', '`CLOCK: [2025-12-09 Tue 14:30]`'];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), []);
    });

    test('blank line *before* CLOCK but after TIMESTAMP terminates the search', () => {
        const lines = ['## TODO Task', '`CREATED: [2025-12-09 Tue]`', '', '`CLOCK: [2025-12-09 Tue 14:30]`'];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), []);
    });

    test('non-blank, non-CLOCK, non-TIMESTAMP line ends the CLOCK block', () => {
        const lines = [
            '## TODO Task',
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`',
            'some narrative text',
            '`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 15:00] => 1:00`'
        ];
        // The second CLOCK is hidden behind narrative -- not picked up.
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [1]);
    });

    test('trailing blank lines after the last CLOCK are silently allowed', () => {
        const lines = [
            '## TODO Task',
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`',
            '',
            ''
            // EOF -- loop ends naturally
        ];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [1]);
    });

    test('CLOCK with leading whitespace (indented) is still recognised', () => {
        const lines = ['## TODO Task', '    `CLOCK: [2025-12-09 Tue 14:30]`'];
        assert.deepStrictEqual(findClockLinesInLines(lines, 0), [1]);
    });
});
