import * as assert from 'assert';
import { cycleTimestampKeyword, normaliseBracket } from '../../utils/toggleTimestampType';
import { matchTimestampLine } from '../../orgPatterns';

function matchOrThrow(line: string) {
    const hit = matchTimestampLine(line);
    if (!hit) {
        throw new Error(`fixture did not match TIMESTAMP_LINE_REGEX: ${line}`);
    }
    return hit;
}

suite('cycleTimestampKeyword', () => {
    test('SCHEDULED -> DEADLINE (both active, bracket stays `<...>`)', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`DEADLINE: <2025-12-06 Fri>`');
    });

    test('DEADLINE -> CLOSED flips bracket to inactive `[...]`', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`DEADLINE: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`CLOSED: [2025-12-06 Fri]`');
    });

    test('CLOSED -> SCHEDULED flips bracket back to active `<...>`', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`CLOSED: [2025-12-06 Fri]`'));
        assert.strictEqual(result, '`SCHEDULED: <2025-12-06 Fri>`');
    });

    test('CREATED is preserved (not cycled, bracket untouched)', () => {
        const result = cycleTimestampKeyword(matchOrThrow('`CREATED: [2025-12-06 Fri]`'));
        assert.strictEqual(result, '`CREATED: [2025-12-06 Fri]`');
    });

    test('indented line preserves indent across the cycle', () => {
        const result = cycleTimestampKeyword(matchOrThrow('    `SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '    `DEADLINE: <2025-12-06 Fri>`');
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
