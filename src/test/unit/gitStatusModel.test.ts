import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildGitStatus } from '../../utils/git/gitStatusModel';
import type { GitRepoSnapshot, GitSourceFile } from '../../utils/git/gitStatusModel';

const REPO: GitRepoSnapshot = {
    root: '/repo',
    branch: 'master',
    upstream: 'origin/master',
    aheadCommits: 3,
    uncommitted: ['/repo/work.md'],
    unpushed: ['/repo/home.md'],
    commits: [],
    conflicts: []
};

function source(file: string, realPath = file, repoRoot = '/repo'): GitSourceFile {
    return { file, realPath, repoRoot };
}

/** A source file that belongs to no repository (no `repoRoot` at all). */
function outside(file: string): GitSourceFile {
    return { file, realPath: file };
}

suite('buildGitStatus', () => {
    test('counts uncommitted and unpushed files separately', () => {
        const status = buildGitStatus(
            [source('/repo/work.md'), source('/repo/home.md'), source('/repo/notes.md')],
            [REPO],
            'linux'
        );
        assert.strictEqual(status.uncommittedCount, 1);
        assert.strictEqual(status.unpushedCount, 1);
        assert.strictEqual(status.unpushedCommits, 3);
    });

    test('a file can be both uncommitted and unpushed and counts in both', () => {
        const repo: GitRepoSnapshot = { ...REPO, uncommitted: ['/repo/diary.md'], unpushed: ['/repo/diary.md'] };
        const status = buildGitStatus([source('/repo/diary.md')], [repo], 'linux');
        assert.strictEqual(status.uncommittedCount, 1);
        assert.strictEqual(status.unpushedCount, 1);
        assert.deepStrictEqual(
            status.files.map((f) => [f.uncommitted, f.unpushed]),
            [[true, true]]
        );
    });

    test('the same file repeated across tasks is counted once', () => {
        const status = buildGitStatus(
            [source('/repo/work.md'), source('/repo/work.md'), source('/repo/work.md')],
            [REPO],
            'linux'
        );
        assert.strictEqual(status.files.length, 1);
        assert.strictEqual(status.uncommittedCount, 1);
    });

    test('a symlinked source matches the change reported under its real path', () => {
        const status = buildGitStatus([source('/home/user/notes/work.md', '/repo/work.md')], [REPO], 'linux');
        assert.strictEqual(status.uncommittedCount, 1);
        const [file] = status.files;
        assert.ok(file);
        // The page shows the path the user knows and keeps the real one for the
        // tooltip; the label is relative to the repository root.
        assert.strictEqual(file.file, '/home/user/notes/work.md');
        assert.strictEqual(file.realPath, '/repo/work.md');
        assert.strictEqual(file.label, 'work.md');
    });

    test('realPath is omitted when the source is not a symlink', () => {
        const status = buildGitStatus([source('/repo/work.md')], [REPO], 'linux');
        assert.strictEqual(status.files[0]?.realPath, undefined);
    });

    test('the label keeps the path inside the repository, not just the name', () => {
        const status = buildGitStatus([source('/repo/inbox/work.md')], [REPO], 'linux');
        assert.strictEqual(status.files[0]?.label, 'inbox/work.md');
    });

    test('files outside any repository are reported but never counted', () => {
        const status = buildGitStatus([source('/repo/work.md'), outside('/elsewhere/loose.md')], [REPO], 'linux');
        assert.strictEqual(status.outsideGitCount, 1);
        assert.strictEqual(status.uncommittedCount, 1);
        assert.strictEqual(status.unpushedCount, 0);
        assert.strictEqual(status.files.at(-1)?.label, 'loose.md');
    });

    test('counters aggregate across repositories, commits included', () => {
        const second: GitRepoSnapshot = {
            root: '/other',
            branch: 'main',
            upstream: 'origin/main',
            aheadCommits: 2,
            uncommitted: ['/other/plan.md'],
            unpushed: [],
            commits: [],
            conflicts: []
        };
        const status = buildGitStatus(
            [source('/repo/work.md'), source('/other/plan.md', '/other/plan.md', '/other')],
            [REPO, second],
            'linux'
        );
        assert.strictEqual(status.uncommittedCount, 2);
        assert.strictEqual(status.unpushedCommits, 5);
        assert.deepStrictEqual(
            status.repos.map((r) => r.root),
            ['/other', '/repo']
        );
    });

    test('a repository holding none of the view files is dropped from the model', () => {
        const unused: GitRepoSnapshot = {
            root: '/unused',
            branch: 'main',
            aheadCommits: 7,
            uncommitted: ['/unused/x.md'],
            unpushed: ['/unused/x.md'],
            commits: [],
            conflicts: []
        };
        const status = buildGitStatus([source('/repo/work.md')], [REPO, unused], 'linux');
        assert.deepStrictEqual(
            status.repos.map((r) => r.root),
            ['/repo']
        );
        // Without the filter the header would claim 10 unpushed commits for a
        // repository the agenda never showed.
        assert.strictEqual(status.unpushedCommits, 3);
    });

    test('a branch without upstream reports no upstream and no ahead count', () => {
        const detached: GitRepoSnapshot = {
            root: '/repo',
            branch: 'wip',
            uncommitted: ['/repo/work.md'],
            unpushed: [],
            commits: [],
            conflicts: []
        };
        const status = buildGitStatus([source('/repo/work.md')], [detached], 'linux');
        assert.strictEqual(status.repos[0]?.upstream, undefined);
        assert.strictEqual(status.unpushedCount, 0);
        assert.strictEqual(status.unpushedCommits, 0);
    });

    test('a file outside every repository leaves the repository list empty', () => {
        const status = buildGitStatus([outside('/elsewhere/loose.md')], [], 'linux');
        assert.strictEqual(status.repos.length, 0);
    });

    test('a clean repository is still listed, so the chip can say so', () => {
        const clean: GitRepoSnapshot = { ...REPO, aheadCommits: 0, uncommitted: [], unpushed: [] };
        const status = buildGitStatus([source('/repo/notes.md')], [clean], 'linux');
        assert.strictEqual(status.repos.length, 1);
        assert.strictEqual(status.uncommittedCount, 0);
        assert.strictEqual(status.unpushedCount, 0);
    });

    // Conflicts arrive in their own bucket, so a file the user is still
    // resolving is in neither the working-tree nor the index list; counting
    // only those two would file it under "clean".
    test('a conflicted source file is marked, and not counted as clean', () => {
        const merging: GitRepoSnapshot = { ...REPO, uncommitted: [], conflicts: ['/repo/work.md'] };
        const status = buildGitStatus([source('/repo/work.md')], [merging], 'linux');
        const [file] = status.files;
        assert.ok(file);
        assert.strictEqual(file.conflicted, true);
        assert.strictEqual(file.uncommitted, false);
        assert.strictEqual(status.conflictCount, 1);
    });

    // What the panel explains is why the commit button is gone, and that is
    // decided by the repository -- including paths the agenda never reads.
    test('the conflict count is the repository total, not the view intersection', () => {
        const merging: GitRepoSnapshot = {
            ...REPO,
            uncommitted: [],
            conflicts: ['/repo/work.md', '/repo/src/main.ts', '/repo/README.md']
        };
        const status = buildGitStatus([source('/repo/work.md')], [merging], 'linux');
        assert.strictEqual(status.conflictCount, 3);
        assert.strictEqual(status.repos[0]?.conflictCount, 3);
        assert.strictEqual(status.files.length, 1);
    });

    // The list the dropdown prints above the files it is about; the count in
    // `aheadCommits` stays the whole truth, so a shorter list is what the
    // "and N more" line is computed from.
    test('the commits of a repository reach the model in order', () => {
        const ahead: GitRepoSnapshot = {
            ...REPO,
            commits: [
                { hash: 'aaaaaaa', subject: 'Newest' },
                { hash: 'bbbbbbb', subject: 'Older' }
            ]
        };
        const status = buildGitStatus([source('/repo/home.md')], [ahead], 'linux');
        assert.deepStrictEqual(status.repos[0]?.unpushedCommitList, [
            { hash: 'aaaaaaa', subject: 'Newest' },
            { hash: 'bbbbbbb', subject: 'Older' }
        ]);
    });

    test('a repository with no listed commits carries no list at all', () => {
        // Not an empty array: the page tells "no commits to show" from "the
        // collector could not read them" by the key being absent.
        const status = buildGitStatus([source('/repo/home.md')], [REPO], 'linux');
        assert.strictEqual(status.repos[0]?.unpushedCommitList, undefined);
    });

    test('a repository with no merge in progress reports no conflict count at all', () => {
        const status = buildGitStatus([source('/repo/work.md')], [REPO], 'linux');
        assert.strictEqual(status.conflictCount, 0);
        assert.strictEqual(status.repos[0]?.conflictCount, undefined);
    });

    test('the label keeps windows separators when the platform is windows', () => {
        const winRepo: GitRepoSnapshot = { ...REPO, root: 'C:\\repo', uncommitted: [], unpushed: [] };
        const status = buildGitStatus(
            [{ file: 'C:\\repo\\inbox\\work.md', realPath: 'C:\\repo\\inbox\\work.md', repoRoot: 'C:\\repo' }],
            [winRepo],
            'win32'
        );
        assert.strictEqual(status.files[0]?.label, 'inbox\\work.md');
        assert.strictEqual(status.repos[0]?.name, 'repo');
    });
});
