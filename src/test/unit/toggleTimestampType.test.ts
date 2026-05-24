import * as assert from 'assert';
import { cycleTimestampKeyword, normaliseBracket, CYCLE_ORDER } from '../../utils/toggleTimestampType';
import { matchTimestampLine, TimestampLineKeyword } from '../../orgPatterns';

function matchOrThrow(line: string) {
    const hit = matchTimestampLine(line);
    if (!hit) {
        throw new Error(`fixture did not match TIMESTAMP_LINE_REGEX: ${line}`);
    }
    return hit;
}

suite('cycleTimestampKeyword', () => {
    test('cycle order is SCHEDULED -> DEADLINE -> CLOSED -> CREATED', () => {
        assert.deepStrictEqual([...CYCLE_ORDER], ['SCHEDULED', 'DEADLINE', 'CLOSED', 'CREATED']);
    });

    test('SCHEDULED -> DEADLINE (both active, bracket stays `<...>`)', () => {
        const r = cycleTimestampKeyword(matchOrThrow('`SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(r.line, '`DEADLINE: <2025-12-06 Fri>`');
        assert.strictEqual(r.from, 'SCHEDULED');
        assert.strictEqual(r.to, 'DEADLINE');
        assert.deepStrictEqual(r.skipped, []);
    });

    test('DEADLINE -> CLOSED flips bracket to inactive `[...]`', () => {
        const r = cycleTimestampKeyword(matchOrThrow('`DEADLINE: <2025-12-06 Fri>`'));
        assert.strictEqual(r.line, '`CLOSED: [2025-12-06 Fri]`');
        assert.strictEqual(r.to, 'CLOSED');
        assert.deepStrictEqual(r.skipped, []);
    });

    test('CLOSED -> CREATED keeps inactive `[...]`', () => {
        const r = cycleTimestampKeyword(matchOrThrow('`CLOSED: [2025-12-06 Fri]`'));
        assert.strictEqual(r.line, '`CREATED: [2025-12-06 Fri]`');
        assert.strictEqual(r.to, 'CREATED');
        assert.deepStrictEqual(r.skipped, []);
    });

    test('CREATED -> SCHEDULED flips bracket back to active `<...>`', () => {
        const r = cycleTimestampKeyword(matchOrThrow('`CREATED: [2025-12-06 Fri]`'));
        assert.strictEqual(r.line, '`SCHEDULED: <2025-12-06 Fri>`');
        assert.strictEqual(r.to, 'SCHEDULED');
        assert.deepStrictEqual(r.skipped, []);
    });

    test('indented line preserves indent across the cycle', () => {
        const r = cycleTimestampKeyword(matchOrThrow('    `SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(r.line, '    `DEADLINE: <2025-12-06 Fri>`');
    });
});

suite('cycleTimestampKeyword: skip duplicates via usedKeywords', () => {
    function used(...types: TimestampLineKeyword[]): Set<TimestampLineKeyword> {
        return new Set(types);
    }

    test('skip a single occupied slot one hop away', () => {
        // CLOSED -> CREATED is the natural step; CREATED occupied means
        // the cycle skips it and lands on SCHEDULED.
        const r = cycleTimestampKeyword(matchOrThrow('`CLOSED: [2025-12-06 Fri]`'), used('CREATED'));
        assert.strictEqual(r.line, '`SCHEDULED: <2025-12-06 Fri>`');
        assert.strictEqual(r.to, 'SCHEDULED');
        assert.deepStrictEqual(r.skipped, ['CREATED']);
    });

    test('skip two occupied slots in a row', () => {
        // SCHEDULED -> DEADLINE -> CLOSED both occupied -> land on CREATED.
        const r = cycleTimestampKeyword(matchOrThrow('`SCHEDULED: <2025-12-06 Fri>`'), used('DEADLINE', 'CLOSED'));
        assert.strictEqual(r.line, '`CREATED: [2025-12-06 Fri]`');
        assert.strictEqual(r.to, 'CREATED');
        assert.deepStrictEqual(r.skipped, ['DEADLINE', 'CLOSED']);
    });

    test('every other slot occupied -> no-op with `from === to` and skipped lists the walked-past types', () => {
        const r = cycleTimestampKeyword(
            matchOrThrow('`CLOSED: [2025-12-06 Fri]`'),
            used('SCHEDULED', 'DEADLINE', 'CREATED')
        );
        assert.strictEqual(r.line, '`CLOSED: [2025-12-06 Fri]`');
        assert.strictEqual(r.from, 'CLOSED');
        assert.strictEqual(r.to, 'CLOSED');
        // skipped contains every type the cycle walked past before
        // wrapping back to the source. Order follows CYCLE_ORDER from
        // CLOSED+1: CREATED, SCHEDULED, DEADLINE.
        assert.deepStrictEqual(r.skipped, ['CREATED', 'SCHEDULED', 'DEADLINE']);
    });

    test('empty usedKeywords behaves like the default (CLOSED -> CREATED, no skip)', () => {
        const r = cycleTimestampKeyword(matchOrThrow('`CLOSED: [2025-12-06 Fri]`'), used());
        assert.strictEqual(r.line, '`CREATED: [2025-12-06 Fri]`');
        assert.deepStrictEqual(r.skipped, []);
    });

    test('skipping flips the bracket form to match the new keywords policy', () => {
        // DEADLINE (active) -> skip CLOSED -> land on CREATED (inactive).
        const r = cycleTimestampKeyword(matchOrThrow('`DEADLINE: <2025-12-06 Fri 14:30>`'), used('CLOSED'));
        assert.strictEqual(r.line, '`CREATED: [2025-12-06 Fri 14:30]`');
        assert.deepStrictEqual(r.skipped, ['CLOSED']);
    });
});

suite('normaliseBracket', () => {
    test('converts active to inactive', () => {
        assert.strictEqual(normaliseBracket('<2025-12-06 Fri 14:30>', false), '[2025-12-06 Fri 14:30]');
    });

    test('converts inactive to active', () => {
        assert.strictEqual(normaliseBracket('[2025-12-06 Fri 14:30]', true), '<2025-12-06 Fri 14:30>');
    });

    test('idempotent when target matches source', () => {
        assert.strictEqual(normaliseBracket('<2025-12-06>', true), '<2025-12-06>');
        assert.strictEqual(normaliseBracket('[2025-12-06]', false), '[2025-12-06]');
    });
});
