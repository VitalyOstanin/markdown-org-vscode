import * as assert from 'assert';
import { toggleTimestampType } from '../../utils/toggleTimestampType';
import { TIMESTAMP_LINE_REGEX } from '../../orgPatterns';

function matchOrThrow(line: string): RegExpMatchArray {
    const match = line.match(TIMESTAMP_LINE_REGEX);
    if (!match?.groups) {
        throw new Error(`fixture did not match TIMESTAMP_LINE_REGEX: ${line}`);
    }
    return match;
}

suite('toggleTimestampType', () => {
    test('SCHEDULED -> DEADLINE', () => {
        const result = toggleTimestampType(matchOrThrow('`SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`DEADLINE: <2025-12-06 Fri>`');
    });

    test('DEADLINE -> CLOSED', () => {
        const result = toggleTimestampType(matchOrThrow('`DEADLINE: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`CLOSED: <2025-12-06 Fri>`');
    });

    test('CLOSED -> SCHEDULED (wraps around)', () => {
        const result = toggleTimestampType(matchOrThrow('`CLOSED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`SCHEDULED: <2025-12-06 Fri>`');
    });

    test('CREATED is preserved (not cycled)', () => {
        const result = toggleTimestampType(matchOrThrow('`CREATED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '`CREATED: <2025-12-06 Fri>`');
    });

    test('indented line preserves indent across the toggle', () => {
        const result = toggleTimestampType(matchOrThrow('    `SCHEDULED: <2025-12-06 Fri>`'));
        assert.strictEqual(result, '    `DEADLINE: <2025-12-06 Fri>`');
    });

    test('unknown type is left untouched instead of cycling to SCHEDULED', () => {
        // Defensive: TIMESTAMP_LINE_REGEX prevents this in practice (it only
        // matches the four known types), but if a caller fabricates a match
        // with an unknown `type` group, the old code returned 'SCHEDULED'
        // via (-1 + 1) % 3 = 0. The guarded version returns the line as-is.
        const fakeMatch = {
            groups: {
                indent: '',
                type: 'NOTANTYPE',
                timestamp: '<2025-12-06 Fri>'
            }
        } as unknown as RegExpMatchArray;
        assert.strictEqual(toggleTimestampType(fakeMatch), '`NOTANTYPE: <2025-12-06 Fri>`');
    });
});
