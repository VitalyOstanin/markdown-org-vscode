import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { group, namedGroups, splitInto } from '../../utils/regexGroups';

suite('regexGroups.group', () => {
    test('returns a positional capture group', () => {
        const match = /(\d{2}):(\d{2})/.exec('09:45');
        assert.ok(match);
        assert.strictEqual(group(match, 1), '09');
        assert.strictEqual(group(match, 2), '45');
    });

    test('returns the whole match at index 0', () => {
        const match = /\d+/.exec('abc 123');
        assert.ok(match);
        assert.strictEqual(group(match, 0), '123');
    });

    test('throws for a group the pattern left unfilled', () => {
        // The second alternative matched, so group 1 took part in no match.
        const match = /(a)|b/.exec('b');
        assert.ok(match);
        assert.throws(() => group(match, 1), /capture group 1 is missing/);
    });

    test('throws for a group index the pattern does not have', () => {
        const match = /(a)/.exec('a');
        assert.ok(match);
        assert.throws(() => group(match, 2), /capture group 2 is missing/);
    });
});

suite('regexGroups.namedGroups', () => {
    test('reads several named groups at once', () => {
        const match = /(?<hour>\d{2}):(?<minute>\d{2})/.exec('09:45');
        assert.ok(match);
        assert.deepStrictEqual(namedGroups(match, 'hour', 'minute'), { hour: '09', minute: '45' });
    });

    test('throws when the pattern has no named groups at all', () => {
        const match = /(\d+)/.exec('12');
        assert.ok(match);
        assert.throws(() => namedGroups(match, 'hour'), /carries no named capture groups/);
    });

    test('throws for a named group the pattern left unfilled', () => {
        const match = /(?<a>x)?y/.exec('y');
        assert.ok(match);
        assert.throws(() => namedGroups(match, 'a'), /named capture group a is missing/);
    });
});

suite('regexGroups.splitInto', () => {
    test('splits into exactly the requested number of parts', () => {
        assert.deepStrictEqual(splitInto('2026-07-26', '-', 3), ['2026', '07', '26']);
        assert.deepStrictEqual(splitInto('09:45', ':', 2), ['09', '45']);
    });

    test('throws when the input has too few parts', () => {
        assert.throws(() => splitInto('2026-07', '-', 3), /expected 3 "-"-separated parts/);
    });

    test('throws when the input has too many parts', () => {
        assert.throws(() => splitInto('09:45:00', ':', 2), /got 3/);
    });
});
