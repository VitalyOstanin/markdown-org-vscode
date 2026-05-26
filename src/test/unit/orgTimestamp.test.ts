import * as assert from 'assert';
import { suite, test } from 'mocha';
import { buildOrgTimestamp } from '../../utils/orgTimestamp';

suite('orgTimestamp.buildOrgTimestamp', () => {
    test('angle bracket with weekday and time', () => {
        const date = new Date(2025, 11, 6, 14, 30); // 2025-12-06 14:30 local
        assert.strictEqual(buildOrgTimestamp({ date, bracket: 'angle', weekday: 'Sat' }), '<2025-12-06 Sat 14:30>');
    });

    test('square bracket with weekday and time', () => {
        const date = new Date(2025, 11, 6, 14, 30);
        assert.strictEqual(buildOrgTimestamp({ date, bracket: 'square', weekday: 'Sat' }), '[2025-12-06 Sat 14:30]');
    });

    test('weekday omitted when not provided', () => {
        const date = new Date(2025, 11, 6, 14, 30);
        assert.strictEqual(buildOrgTimestamp({ date, bracket: 'angle' }), '<2025-12-06 14:30>');
    });

    test('time omitted when includeTime is false', () => {
        const date = new Date(2025, 11, 6, 14, 30);
        assert.strictEqual(
            buildOrgTimestamp({ date, bracket: 'angle', weekday: 'Sat', includeTime: false }),
            '<2025-12-06 Sat>'
        );
    });

    test('repeater appended after time', () => {
        const date = new Date(2025, 11, 6, 10, 0);
        assert.strictEqual(
            buildOrgTimestamp({ date, bracket: 'angle', weekday: 'Sat', repeater: '+1d' }),
            '<2025-12-06 Sat 10:00 +1d>'
        );
    });

    test('month, day, hour, minute are zero-padded to two digits', () => {
        const date = new Date(2025, 0, 5, 9, 5); // 2025-01-05 09:05
        assert.strictEqual(buildOrgTimestamp({ date, bracket: 'square', weekday: 'Sun' }), '[2025-01-05 Sun 09:05]');
    });

    test('year is zero-padded to four digits', () => {
        const date = new Date(2025, 0, 1, 0, 0);
        date.setFullYear(999); // Date ctor maps 0..99 to the 1900s; set explicitly
        assert.strictEqual(
            buildOrgTimestamp({ date, bracket: 'square', weekday: 'Mon', includeTime: false }),
            '[0999-01-01 Mon]'
        );
    });
});
