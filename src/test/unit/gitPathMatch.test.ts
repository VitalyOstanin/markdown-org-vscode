import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildPathSet, isInside, pathKey, pathSetHas, pathsEqual } from '../../utils/git/gitPathMatch';

suite('gitPathMatch', () => {
    test('normalizes redundant segments so the same file has one key', () => {
        assert.strictEqual(pathKey('/repo/notes/../notes/work.md', 'linux'), '/repo/notes/work.md');
    });

    test('drops a trailing separator but keeps the root itself', () => {
        assert.strictEqual(pathKey('/repo/notes/', 'linux'), '/repo/notes');
        assert.strictEqual(pathKey('/', 'linux'), '/');
    });

    test('linux keeps case: two spellings are two different files', () => {
        assert.strictEqual(pathsEqual('/repo/Work.md', '/repo/work.md', 'linux'), false);
    });

    test('macOS and Windows fold case, as the git extension does', () => {
        assert.strictEqual(pathsEqual('/repo/Work.md', '/repo/work.md', 'darwin'), true);
        assert.strictEqual(pathsEqual('C:\\Repo\\Work.md', 'c:\\repo\\work.md', 'win32'), true);
    });

    test('isInside accepts the directory itself and its descendants', () => {
        assert.strictEqual(isInside('/repo', '/repo', 'linux'), true);
        assert.strictEqual(isInside('/repo', '/repo/notes/work.md', 'linux'), true);
    });

    test('isInside is not a prefix test: a sibling with a longer name is outside', () => {
        assert.strictEqual(isInside('/repo', '/repo-backup/work.md', 'linux'), false);
    });

    test('a symlink path and its target match once both sides are realpath-resolved', () => {
        // What the caller does: resolve both, then compare. The link path itself
        // is deliberately NOT equal to the target -- that is the bug this
        // module exists to make impossible to write by accident.
        const linkPath = '/home/user/notes/work.md';
        const realPath = '/data/repo/notes/work.md';
        assert.strictEqual(pathsEqual(linkPath, realPath, 'linux'), false);

        const changes = buildPathSet([realPath], 'linux');
        assert.strictEqual(pathSetHas(changes, realPath, 'linux'), true);
        assert.strictEqual(pathSetHas(changes, linkPath, 'linux'), false);
    });

    test('buildPathSet collapses duplicate spellings of one path', () => {
        const set = buildPathSet(['/repo/a.md', '/repo/./a.md', '/repo/b/../a.md'], 'linux');
        assert.strictEqual(set.size, 1);
    });

    test('pathSetHas normalizes the probe as well as the stored keys', () => {
        const set = buildPathSet(['/repo/notes/work.md'], 'linux');
        assert.strictEqual(pathSetHas(set, '/repo/notes/./work.md', 'linux'), true);
    });
});
