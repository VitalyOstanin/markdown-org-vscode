import * as assert from 'assert';
import { getTimestampPartAt, getClockTimestampPartAt } from '../../utils/timestampParts';

suite('getTimestampPartAt (plain timestamp)', () => {
    // Layout for `<2025-12-06 Fri 14:30>`:
    //   index: 0         1         2
    //          0123456789012345678901
    //          <2025-12-06 Fri 14:30>
    //   year:    [1, 5)
    //   month:   [6, 8)
    //   day:     [9, 11)
    //   weekday: [12, 15)
    //   hour:    [16, 18)
    //   minute:  [19, 21)
    const LINE = '<2025-12-06 Fri 14:30>';

    test('returns null when cursor is outside any timestamp', () => {
        assert.strictEqual(getTimestampPartAt('no timestamp here', 4), null);
    });

    test('returns null when cursor is on the opening bracket', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 0), null);
    });

    test('returns null when cursor is on the closing bracket', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 21), null);
    });

    test('cursor at the very first year digit -> year', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 1)?.part, 'year');
    });

    test('cursor at the last year digit -> year', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 4)?.part, 'year');
    });

    test('cursor on the year/month separator hyphen -> null', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 5), null);
    });

    test('cursor at first month digit -> month', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 6)?.part, 'month');
    });

    test('cursor at last month digit -> month', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 7)?.part, 'month');
    });

    test('cursor on the month/day separator hyphen -> null', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 8), null);
    });

    test('cursor at first day digit -> day', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 9)?.part, 'day');
    });

    test('cursor at last day digit -> day', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 10)?.part, 'day');
    });

    test('cursor on the day/weekday space -> null', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 11), null);
    });

    test('cursor at first weekday letter -> weekday', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 12)?.part, 'weekday');
    });

    test('cursor at last weekday letter -> weekday', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 14)?.part, 'weekday');
    });

    test('cursor on the weekday/time space -> null', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 15), null);
    });

    test('cursor at first hour digit -> hour', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 16)?.part, 'hour');
    });

    test('cursor at last hour digit -> hour', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 17)?.part, 'hour');
    });

    test('cursor on the hour/minute colon -> null', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 18), null);
    });

    test('cursor at first minute digit -> minute', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 19)?.part, 'minute');
    });

    test('cursor at last minute digit -> minute', () => {
        assert.strictEqual(getTimestampPartAt(LINE, 20)?.part, 'minute');
    });

    test('returned range covers the whole timestamp', () => {
        const result = getTimestampPartAt(LINE, 2);
        assert.ok(result);
        assert.strictEqual(result!.start, 0);
        assert.strictEqual(result!.end, LINE.length);
    });

    test('date-only timestamp without weekday or time', () => {
        // `<2025-12-06>` -- year [1, 5), month [6, 8), day [9, 11)
        const dateOnly = '<2025-12-06>';
        assert.strictEqual(getTimestampPartAt(dateOnly, 1)?.part, 'year');
        assert.strictEqual(getTimestampPartAt(dateOnly, 6)?.part, 'month');
        assert.strictEqual(getTimestampPartAt(dateOnly, 9)?.part, 'day');
        assert.strictEqual(getTimestampPartAt(dateOnly, 10)?.part, 'day');
        assert.strictEqual(getTimestampPartAt(dateOnly, 11), null);
    });

    test('Russian full-form weekday spans full length', () => {
        // `<2025-12-06 Пятница 14:30>` -- weekday is 7 chars
        const ru = '<2025-12-06 Пятница 14:30>';
        const wdStart = ru.indexOf('Пятница');
        const wdLast = wdStart + 'Пятница'.length - 1;
        assert.strictEqual(getTimestampPartAt(ru, wdStart)?.part, 'weekday');
        assert.strictEqual(getTimestampPartAt(ru, wdLast)?.part, 'weekday');
        // Space immediately after weekday is not part of weekday.
        assert.strictEqual(getTimestampPartAt(ru, wdLast + 1), null);
    });

    test('finds the right timestamp when two appear on one line', () => {
        // `<2025-12-06> <2025-12-07>`
        const two = '<2025-12-06> <2025-12-07>';
        assert.strictEqual(getTimestampPartAt(two, 1)?.part, 'year');
        // Position 13 is `<` of the second timestamp -> null.
        assert.strictEqual(getTimestampPartAt(two, 13), null);
        // Position 14 is the first year digit of the second timestamp.
        assert.strictEqual(getTimestampPartAt(two, 14)?.part, 'year');
        // Position 12 is the space between -> null.
        assert.strictEqual(getTimestampPartAt(two, 12), null);
    });
});

suite('getClockTimestampPartAt', () => {
    // Layout for `` `CLOCK: [2025-12-09 Tue 14:30]--[2025-12-09 Tue 16:45] =>  2:15` ``
    //   pos: 0         1         2         3         4         5         6
    //        0123456789012345678901234567890123456789012345678901234567890123
    //        `CLOCK: [2025-12-09 Tue 14:30]--[2025-12-09 Tue 16:45] =>  2:15`
    //
    //   start-year:    [9, 13)
    //   start-month:   [14, 16)
    //   start-day:     [17, 19)
    //   start-weekday: [20, 23)
    //   start-hour:    [24, 26)
    //   start-minute:  [27, 29)
    //   end-year:      [33, 37)
    //   end-month:     [38, 40)
    //   end-day:       [41, 43)
    //   end-weekday:   [44, 47)
    //   end-hour:      [48, 50)
    //   end-minute:    [51, 53)
    const CLOSED_CLOCK = '`CLOCK: [2025-12-09 Tue 14:30]--[2025-12-09 Tue 16:45] =>  2:15`';

    test('start-year boundaries', () => {
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 9)?.part, 'start-year');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 12)?.part, 'start-year');
        // The hyphen between year and month is no man's land.
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 13), null);
    });

    test('start-month boundaries', () => {
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 14)?.part, 'start-month');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 15)?.part, 'start-month');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 16), null);
    });

    test('start-hour and start-minute boundaries (half-open)', () => {
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 24)?.part, 'start-hour');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 25)?.part, 'start-hour');
        // Colon between hour and minute is no man's land.
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 26), null);
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 27)?.part, 'start-minute');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 28)?.part, 'start-minute');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 29), null);
    });

    test('end-year boundaries', () => {
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 33)?.part, 'end-year');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 36)?.part, 'end-year');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 37), null);
    });

    test('end-minute boundaries (half-open)', () => {
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 51)?.part, 'end-minute');
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 52)?.part, 'end-minute');
        // Closing bracket `]` is no man's land.
        assert.strictEqual(getClockTimestampPartAt(CLOSED_CLOCK, 53), null);
    });

    test('open CLOCK (no end timestamp) -- only start parts addressable', () => {
        const open = '`CLOCK: [2025-12-09 Tue 14:30]`';
        assert.strictEqual(getClockTimestampPartAt(open, 9)?.part, 'start-year');
        assert.strictEqual(getClockTimestampPartAt(open, 27)?.part, 'start-minute');
        // Beyond the start timestamp there is no end timestamp to address.
        assert.strictEqual(getClockTimestampPartAt(open, 29), null);
    });

    test('returns null when the line is not a CLOCK entry', () => {
        assert.strictEqual(getClockTimestampPartAt('## TODO Just a heading', 5), null);
    });
});
