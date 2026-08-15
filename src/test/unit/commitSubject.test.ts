import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { commitSubject } from '../../utils/git/commitSubject';

/**
 * One row per commit in the panel, so a message with a body has to be cut at
 * its first line. Every repository the integration suite builds is committed
 * with `-m`, which is why the case this exists for is checked here.
 */
suite('commitSubject', () => {
    test('a message with a body keeps only its first line', () => {
        assert.equal(commitSubject('Sort the backlog\n\nWhy: the week view listed them twice.\n'), 'Sort the backlog');
    });

    test('the line break git writes on Windows is a break too', () => {
        assert.equal(commitSubject('Fix the header\r\n\r\nDetails follow.'), 'Fix the header');
    });

    test('a one-line message is its own subject', () => {
        assert.equal(commitSubject('local only'), 'local only');
    });

    test('trailing whitespace is dropped, so the row is not padded', () => {
        assert.equal(commitSubject('  Trim me   \nbody'), 'Trim me');
        assert.equal(commitSubject(''), '');
    });
});
