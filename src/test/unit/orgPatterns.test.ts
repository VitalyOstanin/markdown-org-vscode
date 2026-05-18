import * as assert from 'assert';
import { CLOCK_REGEX, HEADING_REGEX, TIMESTAMP_LINE_REGEX } from '../../orgPatterns';

suite('orgPatterns named groups', () => {
    suite('HEADING_REGEX', () => {
        test('exposes hashes, status, priority, title via named groups', () => {
            const match = '## TODO [#A] Task title'.match(HEADING_REGEX);
            assert.ok(match);
            assert.ok(match.groups, 'HEADING_REGEX must expose match.groups');
            assert.strictEqual(match.groups.hashes, '##');
            assert.strictEqual(match.groups.status, 'TODO');
            assert.strictEqual(match.groups.priority, 'A');
            assert.strictEqual(match.groups.title, 'Task title');
        });

        test('status and priority are undefined when absent', () => {
            const match = '# Plain heading'.match(HEADING_REGEX);
            assert.ok(match);
            assert.ok(match.groups);
            assert.strictEqual(match.groups.status, undefined);
            assert.strictEqual(match.groups.priority, undefined);
            assert.strictEqual(match.groups.title, 'Plain heading');
        });

        test('DONE status without priority parses', () => {
            const match = '### DONE Wrap-up'.match(HEADING_REGEX);
            assert.ok(match);
            assert.ok(match.groups);
            assert.strictEqual(match.groups.hashes, '###');
            assert.strictEqual(match.groups.status, 'DONE');
            assert.strictEqual(match.groups.priority, undefined);
            assert.strictEqual(match.groups.title, 'Wrap-up');
        });
    });

    suite('TIMESTAMP_LINE_REGEX', () => {
        test('exposes indent, type, timestamp via named groups', () => {
            const match = '  `SCHEDULED: <2025-12-06 Fri 10:00>`'.match(TIMESTAMP_LINE_REGEX);
            assert.ok(match);
            assert.ok(match.groups, 'TIMESTAMP_LINE_REGEX must expose match.groups');
            assert.strictEqual(match.groups.indent, '  ');
            assert.strictEqual(match.groups.type, 'SCHEDULED');
            assert.strictEqual(match.groups.timestamp, '<2025-12-06 Fri 10:00>');
        });

        test('all four timestamp types are captured', () => {
            for (const type of ['CREATED', 'SCHEDULED', 'DEADLINE', 'CLOSED']) {
                const match = `\`${type}: <2025-12-06 Fri>\``.match(TIMESTAMP_LINE_REGEX);
                assert.ok(match, `expected to match ${type} line`);
                assert.strictEqual(match.groups?.type, type);
            }
        });
    });

    suite('CLOCK_REGEX', () => {
        test('exposes start fields and endBracket via named groups for an open CLOCK', () => {
            const match = '  `CLOCK: [2025-12-06 Fri 10:00]`'.match(CLOCK_REGEX);
            assert.ok(match);
            assert.ok(match.groups, 'CLOCK_REGEX must expose match.groups');
            assert.strictEqual(match.groups.indent, '  ');
            assert.strictEqual(match.groups.startOpenBracket, '[');
            assert.strictEqual(match.groups.startYear, '2025');
            assert.strictEqual(match.groups.startMonth, '12');
            assert.strictEqual(match.groups.startDay, '06');
            assert.strictEqual(match.groups.startBody, 'Fri 10:00');
            assert.strictEqual(match.groups.startCloseBracket, ']');
            assert.strictEqual(match.groups.endOpenBracket, undefined);
        });

        test('exposes all end fields and duration for a closed CLOCK', () => {
            const match = '`CLOCK: [2025-12-06 Fri 10:00]--[2025-12-06 Fri 12:30] =>  2:30`'.match(CLOCK_REGEX);
            assert.ok(match);
            assert.ok(match.groups);
            assert.strictEqual(match.groups.endOpenBracket, '[');
            assert.strictEqual(match.groups.endYear, '2025');
            assert.strictEqual(match.groups.endMonth, '12');
            assert.strictEqual(match.groups.endDay, '06');
            assert.strictEqual(match.groups.endBody, 'Fri 12:30');
            assert.strictEqual(match.groups.endCloseBracket, ']');
            assert.strictEqual(match.groups.durationHours, '2');
            assert.strictEqual(match.groups.durationMinutes, '30');
        });
    });
});
