import * as assert from 'assert';
import { matchTimestampLine } from '../../orgPatterns';

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

    test('Parse SCHEDULED timestamp line (active)', () => {
        const hit = matchTimestampLine('`SCHEDULED: <2025-12-06 Fri 10:00>`');
        assert.ok(hit);
        assert.strictEqual(hit!.indent, '');
        assert.strictEqual(hit!.type, 'SCHEDULED');
        assert.strictEqual(hit!.timestamp, '<2025-12-06 Fri 10:00>');
        assert.strictEqual(hit!.active, true);
    });

    test('Parse DEADLINE timestamp line (active)', () => {
        const hit = matchTimestampLine('`DEADLINE: <2025-12-06 Fri>`');
        assert.ok(hit);
        assert.strictEqual(hit!.type, 'DEADLINE');
        assert.strictEqual(hit!.active, true);
    });

    test('Parse CREATED timestamp line (inactive per ADR-0014)', () => {
        const hit = matchTimestampLine('`CREATED: [2025-12-01 Sun 09:15]`');
        assert.ok(hit);
        assert.strictEqual(hit!.type, 'CREATED');
        assert.strictEqual(hit!.active, false);
    });

    test('Parse CLOSED timestamp line (inactive per ADR-0014)', () => {
        const hit = matchTimestampLine('`CLOSED: [2025-12-03 Tue 14:30]`');
        assert.ok(hit);
        assert.strictEqual(hit!.type, 'CLOSED');
        assert.strictEqual(hit!.active, false);
    });

    test('Reject SCHEDULED with inactive bracket (ADR-0014 violation)', () => {
        assert.strictEqual(matchTimestampLine('`SCHEDULED: [2025-12-06 Fri]`'), null);
    });

    test('Reject CLOSED with active bracket (legacy form)', () => {
        assert.strictEqual(matchTimestampLine('`CLOSED: <2025-12-03 Tue>`'), null);
    });

    test('Reject CREATED with active bracket (legacy form)', () => {
        assert.strictEqual(matchTimestampLine('`CREATED: <2025-12-01 Sun>`'), null);
    });

    test('Parse timestamp line with indent', () => {
        const hit = matchTimestampLine('  `SCHEDULED: <2025-12-06 Fri>`');
        assert.ok(hit);
        assert.strictEqual(hit!.indent, '  ');
        assert.strictEqual(hit!.type, 'SCHEDULED');
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

    // Per-part increment/decrement behaviour (month overflow, weekday recompute,
    // bracket/repeater/time preservation) is covered against the real
    // `incrementTimestamp` in incrementTimestamp.test.ts. The earlier
    // `Increment*`/`Decrement*` cases here only re-tested native `Date.setMonth`
    // on a throwaway Date, so they were dropped as tautological.
});
