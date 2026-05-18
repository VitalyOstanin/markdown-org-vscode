import * as assert from 'assert';
import { TIMESTAMP_LINE_REGEX } from '../../orgPatterns';

suite('Timestamp Tests', () => {
    // Local copy: this is the cursor-aware variant from timestampEdit.ts,
    // not exported from orgPatterns. It captures date parts as separate groups
    // so the unit tests below can pin down parsing semantics directly.
    const TIMESTAMP_REGEX =
        /<(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?: (?<weekday>[А-Яа-яA-Za-z]+))?(?: (?<hour>\d{2}):(?<minute>\d{2}))?(?: (?<repeater>\+\d+[dwmy]{1,2}))?>/;

    test('Parse timestamp with date only', () => {
        const timestamp = '<2025-12-06 Fri>';
        const match = timestamp.match(TIMESTAMP_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.year, '2025');
        assert.strictEqual(match.groups?.month, '12');
        assert.strictEqual(match.groups?.day, '06');
        assert.strictEqual(match.groups?.weekday, 'Fri');
        assert.strictEqual(match.groups?.hour, undefined);
        assert.strictEqual(match.groups?.minute, undefined);
    });

    test('Parse timestamp with date and time', () => {
        const timestamp = '<2025-12-06 Fri 14:30>';
        const match = timestamp.match(TIMESTAMP_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.year, '2025');
        assert.strictEqual(match.groups?.month, '12');
        assert.strictEqual(match.groups?.day, '06');
        assert.strictEqual(match.groups?.weekday, 'Fri');
        assert.strictEqual(match.groups?.hour, '14');
        assert.strictEqual(match.groups?.minute, '30');
    });

    test('Parse timestamp with repeater', () => {
        const timestamp = '<2025-12-06 Fri 10:00 +1d>';
        const match = timestamp.match(TIMESTAMP_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.repeater, '+1d');
    });

    test('Parse timestamp with workday repeater', () => {
        const timestamp = '<2025-12-06 Fri +2wd>';
        const match = timestamp.match(TIMESTAMP_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.repeater, '+2wd');
    });

    test('Parse timestamp with full English weekday name (long form)', () => {
        // Aligns TIMESTAMP_REGEX with CLOCK_REGEX which already accepts
        // [А-Яа-яA-Za-z]+. This also unblocks the isFull branch in
        // getWeekdayName for <>-timestamps -- it was previously unreachable.
        const timestamp = '<2025-12-06 Friday 14:30>';
        const match = timestamp.match(TIMESTAMP_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.weekday, 'Friday');
    });

    test('Parse timestamp with full Russian weekday name (long form)', () => {
        const timestamp = '<2025-12-06 Пятница 14:30>';
        const match = timestamp.match(TIMESTAMP_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.weekday, 'Пятница');
    });

    test('Parse SCHEDULED timestamp line', () => {
        const line = '`SCHEDULED: <2025-12-06 Fri 10:00>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.indent, '');
        assert.strictEqual(match.groups?.type, 'SCHEDULED');
        assert.strictEqual(match.groups?.timestamp, '<2025-12-06 Fri 10:00>');
    });

    test('Parse DEADLINE timestamp line', () => {
        const line = '`DEADLINE: <2025-12-06 Fri>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.type, 'DEADLINE');
    });

    test('Parse CREATED timestamp line', () => {
        const line = '`CREATED: <2025-12-01 Sun 09:15>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.type, 'CREATED');
    });

    test('Parse CLOSED timestamp line', () => {
        const line = '`CLOSED: <2025-12-03 Tue 14:30>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.type, 'CLOSED');
    });

    test('Parse timestamp line with indent', () => {
        const line = '  `SCHEDULED: <2025-12-06 Fri>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.indent, '  ');
        assert.strictEqual(match.groups?.type, 'SCHEDULED');
    });

    test('Toggle timestamp type SCHEDULED to DEADLINE', () => {
        const types = ['SCHEDULED', 'DEADLINE', 'CLOSED'];
        const currentIndex = types.indexOf('SCHEDULED');
        const newIndex = (currentIndex + 1) % types.length;

        assert.strictEqual(types[newIndex], 'DEADLINE');
    });

    test('Toggle timestamp type DEADLINE to CLOSED', () => {
        const types = ['SCHEDULED', 'DEADLINE', 'CLOSED'];
        const currentIndex = types.indexOf('DEADLINE');
        const newIndex = (currentIndex + 1) % types.length;

        assert.strictEqual(types[newIndex], 'CLOSED');
    });

    test('Toggle timestamp type CLOSED to SCHEDULED', () => {
        const types = ['SCHEDULED', 'DEADLINE', 'CLOSED'];
        const currentIndex = types.indexOf('CLOSED');
        const newIndex = (currentIndex + 1) % types.length;

        assert.strictEqual(types[newIndex], 'SCHEDULED');
    });

    test('Increment day', () => {
        const date = new Date('2025-12-06');
        date.setDate(date.getDate() + 1);

        assert.strictEqual(date.getDate(), 7);
        assert.strictEqual(date.getMonth(), 11); // December
    });

    test('Decrement day', () => {
        const date = new Date('2025-12-06');
        date.setDate(date.getDate() - 1);

        assert.strictEqual(date.getDate(), 5);
    });

    test('Increment month', () => {
        const date = new Date('2025-12-06');
        date.setMonth(date.getMonth() + 1);

        assert.strictEqual(date.getMonth(), 0); // January
        assert.strictEqual(date.getFullYear(), 2026);
    });

    test('Increment hour', () => {
        const date = new Date('2025-12-06T14:30:00');
        date.setHours(date.getHours() + 1);

        assert.strictEqual(date.getHours(), 15);
    });

    test('Increment minute', () => {
        const date = new Date('2025-12-06T14:30:00');
        date.setMinutes(date.getMinutes() + 1);

        assert.strictEqual(date.getMinutes(), 31);
    });
});
