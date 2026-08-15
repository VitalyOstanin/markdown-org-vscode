import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { upstreamRef } from '../../utils/git/upstreamRef';

/**
 * The one rule that keeps a repository's own config out of git's option
 * parser: the panel builds `upstream..HEAD` from names it reads out of
 * `.git/config`, and the Git extension passes that string to git as a bare
 * argument.
 */
suite('upstreamRef', () => {
    test('a plain upstream is the ref the panel diffs against', () => {
        assert.equal(upstreamRef({ remote: 'origin', name: 'main' }), 'origin/main');
        assert.equal(upstreamRef(undefined), undefined);
    });

    test('a remote that would be read as an option yields no ref', () => {
        // `--output=<path>` is a real `git log` option: reaching git as a range
        // it writes the log to that file. `git remote add` refuses the name, so
        // it takes a hand-written config -- which is exactly what this drops.
        assert.equal(upstreamRef({ remote: '--output=/tmp/pwned', name: 'main' }), undefined);
        assert.equal(upstreamRef({ remote: 'origin', name: '--output=/tmp/pwned' }), undefined);
    });

    test('a dash anywhere but the front is part of the name', () => {
        // Branch names with dashes are the norm; only the first character
        // decides how git reads the argument.
        assert.equal(upstreamRef({ remote: 'origin', name: 'feature-x' }), 'origin/feature-x');
        assert.equal(upstreamRef({ remote: 'my-fork', name: 'main' }), 'my-fork/main');
    });
});
