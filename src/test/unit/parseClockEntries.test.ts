import * as assert from 'node:assert';
import { parseClockEntries } from '../../utils/parseClockEntries';

suite('parseClockEntries', () => {
    test('TODO heading with a single closed CLOCK', () => {
        const text = '## TODO Task 1\n' + '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 12:30] => 2:30`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Task 1', totalMinutes: 150 }]);
    });

    test('DONE heading is included on equal footing with TODO', () => {
        const text = '## DONE Finished work\n' + '`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 15:45] => 1:45`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Finished work', totalMinutes: 105 }]);
    });

    test('plain heading (no TODO/DONE keyword) with CLOCK is included', () => {
        const text = '## Plain heading\n' + '`CLOCK: [2025-12-09 Tue 09:00]--[2025-12-09 Tue 09:30] => 0:30`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Plain heading', totalMinutes: 30 }]);
    });

    test('mixed TODO + DONE + plain are all summed and ordered by document position', () => {
        const text =
            '## TODO First\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 10:30] => 0:30`\n' +
            '\n' +
            '## DONE Second\n' +
            '`CLOCK: [2025-12-09 Tue 11:00]--[2025-12-09 Tue 12:00] => 1:00`\n' +
            '\n' +
            '## Third\n' +
            '`CLOCK: [2025-12-09 Tue 13:00]--[2025-12-09 Tue 13:15] => 0:15`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [
            { title: 'First', totalMinutes: 30 },
            { title: 'Second', totalMinutes: 60 },
            { title: 'Third', totalMinutes: 15 }
        ]);
    });

    test('multiple CLOCK entries under one heading are summed', () => {
        const text =
            '## TODO Big task\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] => 1:30`\n' +
            '`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 15:00] => 1:00`\n' +
            '`CLOCK: [2025-12-10 Wed 09:00]--[2025-12-10 Wed 09:45] => 0:45`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Big task', totalMinutes: 195 }]);
    });

    test('heading without CLOCK is omitted', () => {
        const text =
            '## TODO Empty\n' +
            'Some prose, no clock here.\n' +
            '\n' +
            '## TODO With CLOCK\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 10:30] => 0:30`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'With CLOCK', totalMinutes: 30 }]);
    });

    test('open CLOCK (no duration tail) does not contribute', () => {
        const text = '## TODO Running\n' + '`CLOCK: [2025-12-09 Tue 10:00]`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, []);
    });

    test('open CLOCK is ignored, closed CLOCK in the same heading still counts', () => {
        const text =
            '## TODO Mixed\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`\n' +
            '`CLOCK: [2025-12-09 Tue 14:00]`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Mixed', totalMinutes: 60 }]);
    });

    test('priority and TODO keyword are stripped from the row title via HEADING_REGEX', () => {
        const text =
            '## TODO [#A] Important task\n' + '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Important task', totalMinutes: 60 }]);
    });

    test('CRLF line endings are handled', () => {
        const text = '## TODO Windows file\r\n' + '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`\r\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Windows file', totalMinutes: 60 }]);
    });

    test('TIMESTAMP lines between heading and CLOCK do not break the block scan', () => {
        const text =
            '## TODO With metadata\n' +
            '`CREATED: [2025-12-09 Tue 09:00]`\n' +
            '`SCHEDULED: <2025-12-10 Wed>`\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'With metadata', totalMinutes: 60 }]);
    });

    test('nested subheadings each get their own row', () => {
        const text =
            '## TODO Parent\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 10:30] => 0:30`\n' +
            '\n' +
            '### TODO Child\n' +
            '`CLOCK: [2025-12-09 Tue 11:00]--[2025-12-09 Tue 11:45] => 0:45`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [
            { title: 'Parent', totalMinutes: 30 },
            { title: 'Child', totalMinutes: 45 }
        ]);
    });
    // The extractor drops these when it computes `total_clock_time`; the table
    // built here has to drop them too, or the same file gets two different
    // totals depending on which project you ask.
    test('a negative duration is dropped, not subtracted', () => {
        const text =
            '## TODO Typo\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`\n' +
            '`CLOCK: [2025-12-09 Tue 12:00]--[2025-12-09 Tue 10:00] => -2:00`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Typo', totalMinutes: 60 }]);
    });

    test('a duration past the 10000-hour bound is dropped', () => {
        const text =
            '## TODO Absurd\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2099-12-09 Tue 11:00] => 10001:00`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Absurd', totalMinutes: 60 }]);
    });

    test('a minutes field of 60 or more is dropped', () => {
        const text =
            '## TODO Malformed\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] => 1:00`\n' +
            '`CLOCK: [2025-12-09 Tue 12:00]--[2025-12-09 Tue 13:15] => 1:75`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Malformed', totalMinutes: 60 }]);
    });

    // Whitespace variants the extractor accepts (`CLOCK:\s*` and `\s*=>\s*` in
    // its clock.rs regex). Org-mode's own output pads the duration to a fixed
    // column, and a hand-edited file can carry either form; counting them here
    // but not there -- or the reverse -- is the very disagreement the shared
    // acceptance rules exist to prevent.
    test('the spacing variants the extractor accepts are counted here too', () => {
        const text =
            '## TODO Spacing\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] =>  1:00`\n' +
            '`CLOCK: [2025-12-09 Tue 12:00]--[2025-12-09 Tue 12:30]=>0:30`\n' +
            '`CLOCK:  [2025-12-09 Tue 14:00]--[2025-12-09 Tue 14:15] => 0:15`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Spacing', totalMinutes: 105 }]);
    });

    test('a closed entry without the duration tail does not end the block', () => {
        // The tail is optional for the extractor, and a line that is not
        // recognized as a CLOCK stops the walk over the heading's block -- so
        // one such line used to take every entry after it with it.
        const text =
            '## TODO Untailed\n' +
            '`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00]`\n' +
            '`CLOCK: [2025-12-10 Wed 10:00]--[2025-12-10 Wed 12:00] =>  2:00`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Untailed', totalMinutes: 120 }]);
    });

    test('a mixed bracket pair is skipped, exactly as the extractor skips it', () => {
        const text =
            '## TODO Mixed\n' +
            '`CLOCK: [2025-12-09 Tue 10:00>--[2025-12-09 Tue 11:00] =>  1:00`\n' +
            '`CLOCK: [2025-12-10 Wed 10:00]--[2025-12-10 Wed 12:00] =>  2:00`\n';
        const rows = parseClockEntries(text);
        assert.deepStrictEqual(rows, [{ title: 'Mixed', totalMinutes: 120 }]);
    });
});
