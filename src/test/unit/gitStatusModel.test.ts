import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildGitStatus, hasGitSignal } from '../../utils/git/gitStatusModel';
import type { GitRepoSnapshot, GitSourceFile } from '../../utils/git/gitStatusModel';

const REPO: GitRepoSnapshot = {
    root: '/repo',
    branch: 'master',
    upstream: 'origin/master',
    aheadCommits: 3,
    uncommitted: ['/repo/work.md'],
    unpushed: ['/repo/home.md']
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
            unpushed: []
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
            unpushed: ['/unused/x.md']
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
            unpushed: []
        };
        const status = buildGitStatus([source('/repo/work.md')], [detached], 'linux');
        assert.strictEqual(status.repos[0]?.upstream, undefined);
        assert.strictEqual(status.unpushedCount, 0);
        assert.strictEqual(status.unpushedCommits, 0);
    });

    test('hasGitSignal is false when no source file belongs to a repository', () => {
        const status = buildGitStatus([outside('/elsewhere/loose.md')], [], 'linux');
        assert.strictEqual(hasGitSignal(status), false);
    });

    test('hasGitSignal is true for a clean repository, so the chip can say so', () => {
        const clean: GitRepoSnapshot = { ...REPO, aheadCommits: 0, uncommitted: [], unpushed: [] };
        const status = buildGitStatus([source('/repo/notes.md')], [clean], 'linux');
        assert.strictEqual(hasGitSignal(status), true);
        assert.strictEqual(status.uncommittedCount, 0);
        assert.strictEqual(status.unpushedCount, 0);
    });
});
