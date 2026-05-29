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

        test('numeric priority [#0] is captured', () => {
            const match = '## TODO [#0] Hottest item'.match(HEADING_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.priority, '0');
            assert.strictEqual(match.groups?.title, 'Hottest item');
        });

        test('numeric priority [#5] is captured', () => {
            const match = '## TODO [#5] Mid item'.match(HEADING_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.priority, '5');
        });

        test('numeric priority [#42] is captured (two-digit value)', () => {
            const match = '## TODO [#42] Forty-two'.match(HEADING_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.priority, '42');
            assert.strictEqual(match.groups?.title, 'Forty-two');
        });

        test('numeric priority [#64] is captured (upper bound)', () => {
            const match = '## TODO [#64] Lowest numeric'.match(HEADING_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.priority, '64');
        });

        test('numeric priority [#65] is rejected (out of range -- consumed as part of title)', () => {
            // The regex falls through: priority group does not match, the
            // bracket cookie remains in the title.
            const match = '## TODO [#65] Out of range'.match(HEADING_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.priority, undefined);
            assert.strictEqual(match.groups?.title, '[#65] Out of range');
        });

        test('numeric priority [#01] is rejected (leading zero)', () => {
            const match = '## TODO [#01] Leading zero'.match(HEADING_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.priority, undefined);
            assert.strictEqual(match.groups?.title, '[#01] Leading zero');
        });
    });

    suite('HEADING_REGEX CANCELLED support', () => {
        test('matches "### CANCELLED Foo"', () => {
            const m = HEADING_REGEX.exec('### CANCELLED Foo');
            assert.ok(m);
            assert.strictEqual(m!.groups!.status, 'CANCELLED');
            assert.strictEqual(m!.groups!.title, 'Foo');
        });
        test('matches "### CANCELLED [#A] Foo"', () => {
            const m = HEADING_REGEX.exec('### CANCELLED [#A] Foo');
            assert.ok(m);
            assert.strictEqual(m!.groups!.status, 'CANCELLED');
            assert.strictEqual(m!.groups!.priority, 'A');
            assert.strictEqual(m!.groups!.title, 'Foo');
        });
        test('does not match lowercase "cancelled"', () => {
            const m = HEADING_REGEX.exec('### cancelled Foo');
            assert.ok(m);
            assert.strictEqual(m!.groups!.status, undefined);
            assert.strictEqual(m!.groups!.title, 'cancelled Foo');
        });
    });

    suite('HEADING_REGEX CANCELED (single-L) support', () => {
        test('matches "### CANCELED Foo"', () => {
            const m = HEADING_REGEX.exec('### CANCELED Foo');
            assert.ok(m);
            assert.strictEqual(m!.groups!.status, 'CANCELED');
            assert.strictEqual(m!.groups!.title, 'Foo');
        });
        test('matches "### CANCELED [#A] Foo"', () => {
            const m = HEADING_REGEX.exec('### CANCELED [#A] Foo');
            assert.ok(m);
            assert.strictEqual(m!.groups!.status, 'CANCELED');
            assert.strictEqual(m!.groups!.priority, 'A');
            assert.strictEqual(m!.groups!.title, 'Foo');
        });
        // Guards the alternation ordering (CANCELLED before CANCELED): the
        // two-L form must still capture as CANCELLED, not partially as CANCELED.
        test('"### CANCELLED Foo" still yields status CANCELLED, not CANCELED', () => {
            const m = HEADING_REGEX.exec('### CANCELLED Foo');
            assert.ok(m);
            assert.strictEqual(m!.groups!.status, 'CANCELLED');
            assert.strictEqual(m!.groups!.title, 'Foo');
        });
    });

    suite('TIMESTAMP_LINE_REGEX (ADR-0014 strict bracket policy)', () => {
        test('SCHEDULED with active bracket matches', () => {
            const match = '  `SCHEDULED: <2025-12-06 Fri 10:00>`'.match(TIMESTAMP_LINE_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.indent, '  ');
            assert.strictEqual(match.groups?.schedTs, '<2025-12-06 Fri 10:00>');
        });

        test('DEADLINE with active bracket matches', () => {
            const match = '`DEADLINE: <2025-12-06 Fri>`'.match(TIMESTAMP_LINE_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.deadTs, '<2025-12-06 Fri>');
        });

        test('CLOSED with inactive bracket matches', () => {
            const match = '`CLOSED: [2025-12-06 Fri]`'.match(TIMESTAMP_LINE_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.closedTs, '[2025-12-06 Fri]');
        });

        test('CREATED with inactive bracket matches', () => {
            const match = '`CREATED: [2025-12-06 Fri]`'.match(TIMESTAMP_LINE_REGEX);
            assert.ok(match);
            assert.strictEqual(match.groups?.createdTs, '[2025-12-06 Fri]');
        });

        test('SCHEDULED with inactive bracket is rejected', () => {
            assert.strictEqual('`SCHEDULED: [2025-12-06 Fri]`'.match(TIMESTAMP_LINE_REGEX), null);
        });

        test('DEADLINE with inactive bracket is rejected', () => {
            assert.strictEqual('`DEADLINE: [2025-12-06 Fri]`'.match(TIMESTAMP_LINE_REGEX), null);
        });

        test('CLOSED with active bracket (legacy form) is rejected', () => {
            assert.strictEqual('`CLOSED: <2025-12-06 Fri>`'.match(TIMESTAMP_LINE_REGEX), null);
        });

        test('CREATED with active bracket (legacy form) is rejected', () => {
            assert.strictEqual('`CREATED: <2025-12-06 Fri>`'.match(TIMESTAMP_LINE_REGEX), null);
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
