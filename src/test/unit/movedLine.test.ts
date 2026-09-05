import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { matchMovedLine, movedDayColumn, movedLine } from '../../utils/movedLine';

/** A date in local time, which is the only time these files are written in. */
function on(text: string): Date {
    const [year, month, day] = text.split('-').map((part) => parseInt(part, 10));
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

suite('the line a move is written on', () => {
    test('names the day being moved and the day it moves to', () => {
        const line = movedLine('', '2026-09-08', on('2026-09-15'), '15:00', 'Tue');

        assert.strictEqual(line, '`MOVED: 2026-09-08 -> <2026-09-15 Tue 15:00>`');
    });

    test('spells the weekday the way the series does', () => {
        const line = movedLine('', '2026-09-08', on('2026-09-15'), '15:00', 'Пн');

        assert.strictEqual(line, '`MOVED: 2026-09-08 -> <2026-09-15 Вт 15:00>`');
    });

    test('keeps a file that writes its weekdays in lowercase writing them so', () => {
        const line = movedLine('', '2026-09-08', on('2026-09-15'), null, 'tue');

        assert.strictEqual(line, '`MOVED: 2026-09-08 -> <2026-09-15 tue>`');
    });

    test('names no weekday where the series names none, and no hour where it has none', () => {
        const line = movedLine('    ', '2026-09-08', on('2026-09-15'), null, null);

        assert.strictEqual(line, '    `MOVED: 2026-09-08 -> <2026-09-15>`');
    });

    test('is read back as the two days and the hour', () => {
        assert.deepStrictEqual(matchMovedLine('`MOVED: 2026-09-08 -> <2026-09-15 Вт 16:30>`'), {
            from: '2026-09-08',
            to: '2026-09-15',
            time: '16:30'
        });
    });

    test('is read back after the date has been walked with the arrows', () => {
        // What Shift+Up leaves behind: the day alone changes, the rest of the
        // line is untouched, and the move still has to be readable.
        assert.deepStrictEqual(matchMovedLine('    `MOVED: 2026-09-08 -> <2026-09-16 Ср 16:30>`'), {
            from: '2026-09-08',
            to: '2026-09-16',
            time: '16:30'
        });
    });

    test('is read back without an hour where it carries none', () => {
        assert.deepStrictEqual(matchMovedLine('`MOVED: 2026-09-08 -> <2026-09-15>`'), {
            from: '2026-09-08',
            to: '2026-09-15',
            time: null
        });
    });

    test('is told apart from the planning lines it stands among', () => {
        for (const line of [
            '`SCHEDULED: <2026-09-15 Tue 15:00>`',
            '`<2026-09-15 Tue 15:00>`',
            '`CREATED: [2026-09-08 Mon 01:06]`',
            'MOVED: 2026-09-08 -> <2026-09-15>',
            '`MOVED: 2026-09-08 -> 2026-09-15`',
            ''
        ]) {
            assert.strictEqual(matchMovedLine(line), null, line);
        }
    });

    test('starts the caret on the day it moves to', () => {
        const line = '`MOVED: 2026-09-08 -> <2026-09-15 Tue 15:00>`';

        assert.strictEqual(line.slice(movedDayColumn(line), movedDayColumn(line) + 10), '2026-09-15');
    });
});
