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
        const result = cycleTimestampKeyword(matchOrThrow('`SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`DEADLINE: <2025-12-06 Fri>`');
    });

    test('DEADLINE -> CLOSED flips bracket to inactive `[...]`', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`DEADLINE: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`CLOSED: [2025-12-06 Fri]`');
    });

    test('CLOSED -> CREATED keeps inactive `[...]`', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`CLOSED: [2025-12-06 Fri]`'));
        assert.strictEqual(result, '`CREATED: [2025-12-06 Fri]`');
    });

    test('CREATED -> SCHEDULED flips bracket back to active `<...>`', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`CREATED: [2025-12-06 Fri]`'));
        assert.strictEqual(result, '`SCHEDULED: <2025-12-06 Fri>`');
    });

    test('indented line preserves indent across the cycle', () => {
        const result = cycleTimestampKeyword(matchOrThrow('    `SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '    `DEADLINE: <2025-12-06 Fri>`');
    });
});

suite('cycleTimestampKeyword: skip duplicates via usedKeywords', () => {
    function used(...types: TimestampLineKeyword[]): Set<TimestampLineKeyword> {
        return new Set(types);
    }

    test('skip a single occupied slot one hop away', () => {
        // CLOSED -> CREATED is the natural step; if CREATED is already
        // present on a sibling line, skip to SCHEDULED.
        const result = cycleTimestampKeyword(matchOrThrow('`CLOSED: [2025-12-06 Fri]`'), used('CREATED'));
        assert.strictEqual(result, '`SCHEDULED: <2025-12-06 Fri>`');
    });

    test('skip two occupied slots in a row', () => {
        // SCHEDULED -> DEADLINE -> CLOSED is the natural pair of steps;
        // both occupied means the next free slot is CREATED.
        const result = cycleTimestampKeyword(matchOrThrow('`SCHEDULED: <2025-12-06 Fri>`'), used('DEADLINE', 'CLOSED'));
        assert.strictEqual(result, '`CREATED: [2025-12-06 Fri]`');
    });

    test('skip back to the same type when every other slot is occupied', () => {
        // SCHEDULED + DEADLINE + CREATED already present, cursor on
        // CLOSED. No free target -- cycle returns CLOSED unchanged.
        const result = cycleTimestampKeyword(
            matchOrThrow('`CLOSED: [2025-12-06 Fri]`'),
            used('SCHEDULED', 'DEADLINE', 'CREATED')
        );
        assert.strictEqual(result, '`CLOSED: [2025-12-06 Fri]`');
    });

    test('the cursor line type is irrelevant in usedKeywords (callers exclude it)', () => {
        // Passing in CLOSED in the used set must not block CLOSED as a
        // self-target -- in practice callers never pass it, but the
        // contract is that the current type is always reachable.
        const result = cycleTimestampKeyword(
            matchOrThrow('`CLOSED: [2025-12-06 Fri]`'),
            used('SCHEDULED', 'DEADLINE', 'CREATED', 'CLOSED')
        );
        // Every slot blocked -- the cycle preserves the current type.
        assert.strictEqual(result, '`CLOSED: [2025-12-06 Fri]`');
    });

    test('empty usedKeywords behaves like the default (CLOSED -> CREATED)', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`CLOSED: [2025-12-06 Fri]`'), used());
        assert.strictEqual(result, '`CREATED: [2025-12-06 Fri]`');
    });

    test('skipping flips the bracket form to match the new keywords policy', () => {
        // DEADLINE (active) -> skip CLOSED -> land on CREATED (inactive).
        // The bracket pair must flip to [...] even though we passed
        // through CLOSED-the-skipped.
        const result = cycleTimestampKeyword(matchOrThrow('`DEADLINE: <2025-12-06 Fri 14:30>`'), used('CLOSED'));
        assert.strictEqual(result, '`CREATED: [2025-12-06 Fri 14:30]`');
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
