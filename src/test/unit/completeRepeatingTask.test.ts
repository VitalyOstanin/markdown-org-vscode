import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { planCompletion } from '../../utils/completeRepeatingTask';
import { RepeaterError } from '../../utils/repeater';

const TODAY = new Date(2026, 6, 31); // Friday, 2026-07-31

suite('planCompletion', () => {
    test('a task without a repeater moves nothing', () => {
        const plan = planCompletion({
            lines: ['## TODO Pay the bill', '`SCHEDULED: <2026-07-30 Чт>`'],
            heading: 0,
            today: TODAY
        });

        assert.strictEqual(plan.repeated, false);
        assert.deepStrictEqual(plan.planning, []);
    });

    test('a repeating SCHEDULED line moves and keeps everything else it carries', () => {
        const plan = planCompletion({
            lines: ['## TODO Water the plants', '`SCHEDULED: <2026-07-30 Чт 09:30 ++2d -1d>`'],
            heading: 0,
            today: TODAY
        });

        assert.strictEqual(plan.repeated, true);
        // 08-01 is past the 31st on the first step; the weekday follows the
        // new date in the language and length the file used.
        assert.deepStrictEqual(plan.planning, [{ line: 1, text: '`SCHEDULED: <2026-08-01 Сб 09:30 ++2d -1d>`' }]);
    });

    test('both planning lines move when both repeat', () => {
        const plan = planCompletion({
            lines: ['## TODO Report', '`SCHEDULED: <2026-07-30 Thu +1w>`', '`DEADLINE: <2026-08-02 Sun +1w>`'],
            heading: 0,
            today: TODAY
        });

        assert.deepStrictEqual(plan.planning, [
            { line: 1, text: '`SCHEDULED: <2026-08-06 Thu +1w>`' },
            { line: 2, text: '`DEADLINE: <2026-08-09 Sun +1w>`' }
        ]);
    });

    test('a planning line without a repeater is left alone beside one that has it', () => {
        const plan = planCompletion({
            lines: ['## TODO Report', '`SCHEDULED: <2026-07-30 Чт +1d>`', '`DEADLINE: <2026-08-02 Вс>`'],
            heading: 0,
            today: TODAY
        });

        // Upstream deletes the second line; the core keeps it, and so does this.
        assert.deepStrictEqual(plan.planning, [{ line: 1, text: '`SCHEDULED: <2026-07-31 Пт +1d>`' }]);
    });

    test('the search covers the section, not only the line below the heading', () => {
        const plan = planCompletion({
            lines: [
                '## TODO Report',
                '`CREATED: [2026-07-01 Ср]`',
                '',
                'A note about it.',
                '`SCHEDULED: <2026-07-30 Чт +1d>`'
            ],
            heading: 0,
            today: TODAY
        });

        assert.deepStrictEqual(plan.planning, [{ line: 4, text: '`SCHEDULED: <2026-07-31 Пт +1d>`' }]);
    });

    test('the next heading ends the section', () => {
        const plan = planCompletion({
            lines: ['## TODO First', '### TODO Second', '`SCHEDULED: <2026-07-30 Чт +1d>`'],
            heading: 0,
            today: TODAY
        });

        assert.strictEqual(plan.repeated, false);
    });

    test('a date-only timestamp stays date-only', () => {
        const plan = planCompletion({
            lines: ['## TODO Weekly', '`SCHEDULED: <2026-07-30 .+1w>`'],
            heading: 0,
            today: TODAY
        });

        // `.+` restarts from today: 2026-07-31 plus a week.
        assert.deepStrictEqual(plan.planning, [{ line: 1, text: '`SCHEDULED: <2026-08-07 .+1w>`' }]);
    });

    test('an indented planning line keeps its indent', () => {
        const plan = planCompletion({
            lines: ['## TODO Nested', '    `SCHEDULED: <2026-07-30 Чт +1d>`'],
            heading: 0,
            today: TODAY
        });

        assert.deepStrictEqual(plan.planning, [{ line: 1, text: '    `SCHEDULED: <2026-07-31 Пт +1d>`' }]);
    });

    test('a working-day repeater is refused rather than counted without the calendar', () => {
        assert.throws(
            () =>
                planCompletion({
                    lines: ['## TODO Standup', '`SCHEDULED: <2026-07-30 Чт +2wd>`'],
                    heading: 0,
                    today: TODAY
                }),
            RepeaterError
        );
    });
});
