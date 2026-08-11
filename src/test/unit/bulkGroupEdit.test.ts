import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { planGroupEdit } from '../../utils/bulkGroupEdit';
import type { BulkTarget } from '../../utils/bulkGroupEdit';

const TODAY = new Date(2026, 7, 10); // Monday, 2026-08-10

/** The band's rows name a file; the planner only compares the value. */
function target(line: number, heading: string, keyword?: 'SCHEDULED' | 'DEADLINE'): BulkTarget {
    return { file: '/notes/inbox.md', line, heading, keyword };
}

suite('planGroupEdit: move to today', () => {
    test('dates the planning line today, keeping the time and the weekday form', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Pay the bill', '`SCHEDULED: <2026-05-04 Пн 09:30>`'],
            targets: [target(1, 'Pay the bill', 'SCHEDULED')],
            action: 'move-to-today',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 1);
        assert.deepStrictEqual(plan.refusals, []);
        assert.deepStrictEqual(plan.lines, ['## TODO Pay the bill', '`SCHEDULED: <2026-08-10 Пн 09:30>`']);
    });

    test('a repeating entry catches up to its next occurrence instead', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Water the plants', '`SCHEDULED: <2026-08-01 Sat ++2d>`'],
            targets: [target(1, 'Water the plants', 'SCHEDULED')],
            action: 'move-to-today',
            today: TODAY
        });

        // 08-01 + 2d steps to 08-11, the first occurrence past today; the
        // repeater rides along.
        assert.deepStrictEqual(plan.lines[1], '`SCHEDULED: <2026-08-11 Tue ++2d>`');
    });

    test('a date-only entry stays date-only', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Renew the pass', '`DEADLINE: <2026-05-04>`'],
            targets: [target(1, 'Renew the pass', 'DEADLINE')],
            action: 'move-to-today',
            today: TODAY
        });

        assert.deepStrictEqual(plan.lines[1], '`DEADLINE: <2026-08-10>`');
    });

    test('only the keyword the row was listed under moves', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Report', '`SCHEDULED: <2026-05-04 Mon>`', '`DEADLINE: <2026-05-08 Fri>`'],
            targets: [target(1, 'Report', 'SCHEDULED')],
            action: 'move-to-today',
            today: TODAY
        });

        assert.deepStrictEqual(plan.lines, [
            '## TODO Report',
            '`SCHEDULED: <2026-08-10 Mon>`',
            '`DEADLINE: <2026-05-08 Fri>`'
        ]);
    });

    test('a row that names no keyword moves both planning lines', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Report', '`SCHEDULED: <2026-05-04 Mon>`', '`DEADLINE: <2026-05-08 Fri>`'],
            targets: [target(1, 'Report')],
            action: 'move-to-today',
            today: TODAY
        });

        assert.deepStrictEqual(plan.lines.slice(1), ['`SCHEDULED: <2026-08-10 Mon>`', '`DEADLINE: <2026-08-10 Mon>`']);
    });

    test('a planning line under a blank line still counts as the task’s', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Call back', '', '`CREATED: [2026-01-01 Thu]`', '`SCHEDULED: <2026-05-04 Mon>`'],
            targets: [target(1, 'Call back', 'SCHEDULED')],
            action: 'move-to-today',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 1);
        assert.deepStrictEqual(plan.lines[3], '`SCHEDULED: <2026-08-10 Mon>`');
    });

    test('the search stops at the next heading', () => {
        const plan = planGroupEdit({
            lines: ['## TODO First', '## TODO Second', '`SCHEDULED: <2026-05-04 Mon>`'],
            targets: [target(1, 'First', 'SCHEDULED')],
            action: 'move-to-today',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 0);
        assert.deepStrictEqual(
            plan.refusals.map((r) => r.reason),
            ['no-planning-line']
        );
        assert.deepStrictEqual(plan.lines[2], '`SCHEDULED: <2026-05-04 Mon>`');
    });
});

suite('planGroupEdit: drop the date', () => {
    test('removes the planning line and leaves the task', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Pay the bill', '`SCHEDULED: <2026-05-04 Mon>`', 'body'],
            targets: [target(1, 'Pay the bill', 'SCHEDULED')],
            action: 'drop-planning',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 1);
        assert.deepStrictEqual(plan.lines, ['## TODO Pay the bill', 'body']);
    });

    test('two entries of one file are both dropped, and the later one is not shifted', () => {
        const plan = planGroupEdit({
            lines: [
                '## TODO First',
                '`SCHEDULED: <2026-05-04 Mon>`',
                '## TODO Second',
                '`SCHEDULED: <2026-05-06 Wed>`'
            ],
            targets: [target(3, 'Second', 'SCHEDULED'), target(1, 'First', 'SCHEDULED')],
            action: 'drop-planning',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 2);
        assert.deepStrictEqual(plan.lines, ['## TODO First', '## TODO Second']);
    });
});

suite('planGroupEdit: mark cancelled', () => {
    test('writes the keyword and keeps the priority cookie', () => {
        const plan = planGroupEdit({
            lines: ['## TODO [#A] Pay the bill', '`SCHEDULED: <2026-05-04 Mon>`'],
            targets: [target(1, 'Pay the bill', 'SCHEDULED')],
            action: 'cancel',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 1);
        assert.deepStrictEqual(plan.lines, ['## CANCELLED [#A] Pay the bill', '`SCHEDULED: <2026-05-04 Mon>`']);
    });

    test('an already cancelled entry changes nothing and is not refused', () => {
        const plan = planGroupEdit({
            lines: ['## CANCELED Pay the bill'],
            targets: [target(1, 'Pay the bill')],
            action: 'cancel',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 0);
        assert.deepStrictEqual(plan.refusals, []);
        assert.deepStrictEqual(plan.lines, ['## CANCELED Pay the bill']);
    });

    test('an entry with no planning line is still cancelled', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Pay the bill'],
            targets: [target(1, 'Pay the bill')],
            action: 'cancel',
            today: TODAY
        });

        assert.deepStrictEqual(plan.lines, ['## CANCELLED Pay the bill']);
    });
});

suite('planGroupEdit: what it refuses', () => {
    test('a heading that has moved since the agenda was built', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Something else'],
            targets: [target(1, 'Pay the bill', 'SCHEDULED')],
            action: 'cancel',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 0);
        assert.deepStrictEqual(
            plan.refusals.map((r) => [r.reason, r.heading]),
            [['moved', 'Pay the bill']]
        );
    });

    test('a heading whose tags the extractor stripped still matches', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Pay the bill :money:'],
            targets: [target(1, 'Pay the bill')],
            action: 'cancel',
            today: TODAY
        });

        assert.deepStrictEqual(plan.lines, ['## CANCELLED Pay the bill :money:']);
    });

    test('a heading whose cookie is not at the front still matches', () => {
        // The agenda's heading comes from the extractor, which reads the cookie
        // for the priority and leaves it in the text (its ADR-0027). The target
        // therefore carries the cookie, and so must the line this matches
        // against -- the two used to disagree here and every group action on
        // such a task was refused as "moved".
        const plan = planGroupEdit({
            lines: ['## TODO Buy [#A] filter'],
            targets: [target(1, 'Buy [#A] filter')],
            action: 'cancel',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 1);
        assert.deepStrictEqual(plan.lines, ['## CANCELLED Buy [#A] filter']);
    });

    test('an entry the action finds no date on', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Pay the bill', 'body'],
            targets: [target(1, 'Pay the bill', 'SCHEDULED')],
            action: 'drop-planning',
            today: TODAY
        });

        assert.strictEqual(plan.refusals[0]?.reason, 'no-planning-line');
        assert.deepStrictEqual(plan.lines, ['## TODO Pay the bill', 'body']);
    });

    test('a repeater the extension does not advance leaves the whole entry alone', () => {
        const plan = planGroupEdit({
            lines: ['## TODO Timesheet', '`SCHEDULED: <2026-05-04 Mon +2wd>`', '`DEADLINE: <2026-05-06 Wed>`'],
            targets: [target(1, 'Timesheet')],
            action: 'move-to-today',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 0);
        assert.strictEqual(plan.refusals[0]?.reason, 'unsupported');
        // Not even the DEADLINE that could have moved: half a move is worse
        // than none.
        assert.deepStrictEqual(plan.lines, [
            '## TODO Timesheet',
            '`SCHEDULED: <2026-05-04 Mon +2wd>`',
            '`DEADLINE: <2026-05-06 Wed>`'
        ]);
    });

    test('one refused entry does not stop the rest of the group', () => {
        const plan = planGroupEdit({
            lines: ['## TODO First', '`SCHEDULED: <2026-05-04 Mon>`', '## TODO Second'],
            targets: [target(1, 'First', 'SCHEDULED'), target(3, 'Second', 'SCHEDULED')],
            action: 'drop-planning',
            today: TODAY
        });

        assert.strictEqual(plan.applied, 1);
        assert.strictEqual(plan.refusals.length, 1);
        assert.deepStrictEqual(plan.lines, ['## TODO First', '## TODO Second']);
    });
});
