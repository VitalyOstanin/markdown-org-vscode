import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { isInside, pathKey } from '../../utils/git/gitPathMatch';

suite('gitPathMatch', () => {
    test('normalizes redundant segments so the same file has one key', () => {
        assert.strictEqual(pathKey('/repo/notes/../notes/work.md', 'linux'), '/repo/notes/work.md');
    });

    test('drops a trailing separator but keeps the root itself', () => {
        assert.strictEqual(pathKey('/repo/notes/', 'linux'), '/repo/notes');
        assert.strictEqual(pathKey('/', 'linux'), '/');
    });

    test('linux keeps case: two spellings are two different files', () => {
        assert.notStrictEqual(pathKey('/repo/Work.md', 'linux'), pathKey('/repo/work.md', 'linux'));
    });

    test('macOS and Windows fold case, as the git extension does', () => {
        assert.strictEqual(pathKey('/repo/Work.md', 'darwin'), pathKey('/repo/work.md', 'darwin'));
        assert.strictEqual(pathKey('C:\\Repo\\Work.md', 'win32'), pathKey('c:\\repo\\work.md', 'win32'));
    });

    test('windows separators survive a posix host, and the reverse', () => {
        // The platform is a parameter, so a Windows key must not depend on the
        // machine running the suite -- and a linux key must not gain
        // backslashes on a Windows checkout.
        assert.strictEqual(pathKey('C:\\repo\\inbox\\..\\work.md', 'win32'), 'c:\\repo\\work.md');
        assert.strictEqual(pathKey('/repo/inbox/../work.md', 'linux'), '/repo/work.md');
    });

    test('isInside accepts the directory itself and its descendants', () => {
        assert.strictEqual(isInside('/repo', '/repo', 'linux'), true);
        assert.strictEqual(isInside('/repo', '/repo/notes/work.md', 'linux'), true);
    });

    test('isInside is not a prefix test: a sibling with a longer name is outside', () => {
        assert.strictEqual(isInside('/repo', '/repo-backup/work.md', 'linux'), false);
    });

    test('a symlink path is not the same key as its target', () => {
        // Why callers resolve both sides before comparing: the link path and
        // the real path are different strings and must stay different keys, or
        // a file would be matched against a change list it is not in.
        const linkPath = '/home/user/notes/work.md';
        const realPath = '/data/repo/notes/work.md';
        assert.notStrictEqual(pathKey(linkPath, 'linux'), pathKey(realPath, 'linux'));
    });

    test('duplicate spellings of one path collapse to a single key', () => {
        const keys = new Set(['/repo/a.md', '/repo/./a.md', '/repo/b/../a.md'].map((p) => pathKey(p, 'linux')));
        assert.strictEqual(keys.size, 1);
    });
});
