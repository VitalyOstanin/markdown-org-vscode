import * as assert from 'node:assert/strict';
import { repeaterToRrule } from '../../../utils/gcal/rrule';

suite('gcal/rrule', () => {
    test('base units map to FREQ, INTERVAL only when > 1', () => {
        assert.deepEqual(repeaterToRrule('+1d'), ['RRULE:FREQ=DAILY']);
        assert.deepEqual(repeaterToRrule('+2d'), ['RRULE:FREQ=DAILY;INTERVAL=2']);
        assert.deepEqual(repeaterToRrule('+1w'), ['RRULE:FREQ=WEEKLY']);
        assert.deepEqual(repeaterToRrule('+7d'), ['RRULE:FREQ=DAILY;INTERVAL=7']);
        assert.deepEqual(repeaterToRrule('+3w'), ['RRULE:FREQ=WEEKLY;INTERVAL=3']);
        assert.deepEqual(repeaterToRrule('+1m'), ['RRULE:FREQ=MONTHLY']);
        assert.deepEqual(repeaterToRrule('+1y'), ['RRULE:FREQ=YEARLY']);
        assert.deepEqual(repeaterToRrule('+2h'), ['RRULE:FREQ=HOURLY;INTERVAL=2']);
    });

    test('prefix flavour is ignored (fixed grid has no DONE-shift notion)', () => {
        const weekly = ['RRULE:FREQ=WEEKLY'];
        assert.deepEqual(repeaterToRrule('+1w'), weekly);
        assert.deepEqual(repeaterToRrule('++1w'), weekly);
        assert.deepEqual(repeaterToRrule('.+1w'), weekly);
    });

    test('++7d (the weekly-meeting case) maps to a weekly rule', () => {
        assert.deepEqual(repeaterToRrule('++7d'), ['RRULE:FREQ=DAILY;INTERVAL=7']);
    });

    test('workday: +1wd -> Mon-Fri, +Nwd (N>1) has no single rule', () => {
        assert.deepEqual(repeaterToRrule('+1wd'), ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']);
        assert.equal(repeaterToRrule('+2wd'), undefined);
    });

    test('absent / malformed / zero-step yields undefined (event stays one-shot)', () => {
        assert.equal(repeaterToRrule(undefined), undefined);
        assert.equal(repeaterToRrule(''), undefined);
        assert.equal(repeaterToRrule('7d'), undefined); // no prefix
        assert.equal(repeaterToRrule('+d'), undefined); // no value
        assert.equal(repeaterToRrule('+1x'), undefined); // unknown unit
        assert.equal(repeaterToRrule('+0d'), undefined); // zero step
        assert.equal(repeaterToRrule('+1d -3d'), undefined); // trailing junk
    });
});
