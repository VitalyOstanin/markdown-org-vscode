import * as assert from 'assert';
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
});
