import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'mocha';
import { canonicalPath, changeKeys, repositoryRoots } from '../../utils/git/repositoryPaths';
import type { RepositoryRoots } from '../../utils/git/repositoryPaths';
import type { GitChange, GitRepository } from '../../utils/git/gitApiTypes';

/** A repository is read for two things here: where its root is, and what changed. */
function repo(root: string, state: Partial<GitRepository['state']> = {}): GitRepository {
    return {
        rootUri: { fsPath: root },
        state: {
            workingTreeChanges: [],
            indexChanges: [],
            onDidChange: () => ({ dispose: () => undefined }),
            ...state
        },
        status: () => Promise.resolve(),
        add: () => Promise.resolve(),
        commit: () => Promise.resolve(),
        push: () => Promise.resolve(),
        // Present because the interface declares them; this module never
        // reaches for either, so a call would be the test's own mistake.
        diffBetween: () => Promise.resolve([]),
        log: () => Promise.resolve([])
    };
}

function change(fsPath: string): GitChange {
    return { uri: { fsPath } };
}

const LINKED: RepositoryRoots = { root: '/home/user/notes', rootReal: '/data/notes' };

suite('repositoryPaths.canonicalPath', () => {
    test('a path already under the real root is left alone', () => {
        assert.strictEqual(canonicalPath('/data/notes/work.md', LINKED, 'linux'), '/data/notes/work.md');
    });

    test('a path under the root as opened is re-anchored on the real one', () => {
        assert.strictEqual(canonicalPath('/home/user/notes/work.md', LINKED, 'linux'), '/data/notes/work.md');
    });

    test('nesting survives the move', () => {
        assert.strictEqual(
            canonicalPath('/home/user/notes/inbox/today.md', LINKED, 'linux'),
            '/data/notes/inbox/today.md'
        );
    });

    test('a path outside both roots comes back unchanged, to match nothing later', () => {
        // Not an error: the caller compares the result against its own paths,
        // and a foreign path simply falls out of every set.
        assert.strictEqual(canonicalPath('/etc/hosts', LINKED, 'linux'), '/etc/hosts');
    });

    test('the root itself counts as inside', () => {
        assert.strictEqual(canonicalPath('/home/user/notes', LINKED, 'linux'), '/data/notes');
    });

    test('a repository opened under its real path rewrites nothing', () => {
        const plain: RepositoryRoots = { root: '/data/notes', rootReal: '/data/notes' };
        assert.strictEqual(canonicalPath('/data/notes/work.md', plain, 'linux'), '/data/notes/work.md');
    });

    test('windows paths canonicalise on a posix host, separators and all', () => {
        // The platform is a parameter for the same reason as in `gitPathMatch`:
        // the answer must not depend on the machine running the suite.
        const win: RepositoryRoots = { root: 'C:\\Users\\u\\notes', rootReal: 'D:\\data\\notes' };
        assert.strictEqual(canonicalPath('C:\\Users\\u\\notes\\work.md', win, 'win32'), 'D:\\data\\notes\\work.md');
    });

    test('windows folds case when deciding what is inside the root', () => {
        const win: RepositoryRoots = { root: 'C:\\Users\\u\\notes', rootReal: 'D:\\data\\notes' };
        assert.strictEqual(canonicalPath('c:\\users\\u\\NOTES\\work.md', win, 'win32'), 'D:\\data\\notes\\work.md');
    });
});

suite('repositoryPaths.changeKeys', () => {
    test('staged files are in both buckets: a commit carries them either way', () => {
        const keys = changeKeys(
            repo('/data/notes', { indexChanges: [change('/data/notes/staged.md')] }),
            { root: '/data/notes', rootReal: '/data/notes' },
            'linux'
        );
        assert.deepStrictEqual([...keys.staged], ['/data/notes/staged.md']);
        assert.deepStrictEqual([...keys.changed], ['/data/notes/staged.md']);
    });

    test('working tree, untracked and index meet in `changed`, index alone in `staged`', () => {
        const keys = changeKeys(
            repo('/data/notes', {
                workingTreeChanges: [change('/data/notes/edited.md')],
                untrackedChanges: [change('/data/notes/new.md')],
                indexChanges: [change('/data/notes/staged.md')]
            }),
            { root: '/data/notes', rootReal: '/data/notes' },
            'linux'
        );
        assert.deepStrictEqual([...keys.changed].sort(), [
            '/data/notes/edited.md',
            '/data/notes/new.md',
            '/data/notes/staged.md'
        ]);
        assert.deepStrictEqual([...keys.staged], ['/data/notes/staged.md']);
    });

    test('an older Git extension without the untracked bucket is read, not crashed on', () => {
        const keys = changeKeys(
            repo('/data/notes', { workingTreeChanges: [change('/data/notes/edited.md')] }),
            { root: '/data/notes', rootReal: '/data/notes' },
            'linux'
        );
        assert.deepStrictEqual([...keys.changed], ['/data/notes/edited.md']);
        assert.strictEqual(keys.staged.size, 0);
    });

    test('changes reported under the linked root land in the real alphabet', () => {
        // This is the point of the module: the repository is open under the
        // symlink, the agenda holds the real path, and the two must compare.
        const keys = changeKeys(
            repo('/home/user/notes', {
                workingTreeChanges: [change('/home/user/notes/edited.md')],
                indexChanges: [change('/home/user/notes/staged.md')]
            }),
            LINKED,
            'linux'
        );
        assert.deepStrictEqual([...keys.changed].sort(), ['/data/notes/edited.md', '/data/notes/staged.md']);
        assert.deepStrictEqual([...keys.staged], ['/data/notes/staged.md']);
    });

    test('two spellings of one file collapse into a single key', () => {
        const keys = changeKeys(
            repo('/home/user/notes', {
                workingTreeChanges: [change('/home/user/notes/work.md')],
                indexChanges: [change('/data/notes/work.md')]
            }),
            LINKED,
            'linux'
        );
        assert.deepStrictEqual([...keys.changed], ['/data/notes/work.md']);
    });
});

suite('repositoryPaths.repositoryRoots', () => {
    test('a real directory reports the same root twice', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-roots-'));
        try {
            const roots = await repositoryRoots(repo(dir), new Map());
            assert.strictEqual(roots.root, dir);
            // Resolved the same way the module does: on Windows the temp path
            // is a short 8.3 name that `fs.promises.realpath` expands and
            // `fs.realpathSync` does not.
            assert.strictEqual(roots.rootReal, await fs.promises.realpath(dir));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('a symlinked root reports both spellings', async () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-roots-'));
        try {
            const real = path.join(base, 'real');
            const link = path.join(base, 'link');
            fs.mkdirSync(real);
            fs.symlinkSync(real, link);
            const roots = await repositoryRoots(repo(link), new Map());
            assert.strictEqual(roots.root, link);
            assert.strictEqual(roots.rootReal, await fs.promises.realpath(real));
        } finally {
            fs.rmSync(base, { recursive: true, force: true });
        }
    });

    test('a root that no longer exists keeps its own spelling', async () => {
        const gone = path.join(os.tmpdir(), 'mo-roots-missing-0aa1');
        const roots = await repositoryRoots(repo(gone), new Map());
        assert.strictEqual(roots.rootReal, gone);
    });

    test('the cache answers for a root asked about twice', async () => {
        const cache = new Map<string, string>();
        cache.set('/opened/as', '/answered/from/cache');
        const roots = await repositoryRoots(repo('/opened/as'), cache);
        assert.strictEqual(roots.rootReal, '/answered/from/cache');
    });
});
