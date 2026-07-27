import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { gitChipTitle, renderGitChip, renderGitMenu } from '../../utils/agendaGitHtml';
import type { GitHtmlContext } from '../../utils/agendaGitHtml';
import { AGENDA_STRINGS, formatString, pluralIndex } from '../../utils/agendaI18n';
import { escapeHtml } from '../../utils/agendaEscapeHtml';
import { formatNumber } from '../../utils/formatNumber';
import type { AgendaGitStatus, GitFileState, GitRepoState } from '../../types';

const CTX: GitHtmlContext = {
    git: AGENDA_STRINGS.en.git,
    locale: 'en-US',
    uiLang: 'en',
    escapeHtml,
    formatString,
    formatNumber,
    pluralIndex
};

const REPO: GitRepoState = {
    root: '/repo',
    name: 'repo',
    branch: 'master',
    upstream: 'origin/master',
    aheadCommits: 3
};

function file(partial: Partial<GitFileState> & { file: string; label: string }): GitFileState {
    return { repoRoot: '/repo', uncommitted: false, unpushed: false, ...partial };
}

function status(partial: Partial<AgendaGitStatus> = {}): AgendaGitStatus {
    const files = partial.files ?? [];
    return {
        repos: [REPO],
        files,
        uncommittedCount: files.filter((f) => f.uncommitted).length,
        unpushedCount: files.filter((f) => f.unpushed).length,
        outsideGitCount: files.filter((f) => f.repoRoot === undefined).length,
        unpushedCommits: 3,
        ...partial
    };
}

suite('renderGitChip', () => {
    test('shows both counters when there are uncommitted and unpushed files', () => {
        const html = renderGitChip(
            status({
                files: [
                    file({ file: '/repo/work.md', label: 'work.md', uncommitted: true }),
                    file({ file: '/repo/home.md', label: 'home.md', unpushed: true })
                ]
            }),
            CTX
        );
        assert.ok(html.includes('data-kind="uncommitted"'), 'uncommitted stat missing');
        assert.ok(html.includes('data-kind="unpushed"'), 'unpushed stat missing');
        assert.ok(!html.includes('data-kind="clean"'), 'clean marker must not appear alongside counters');
    });

    test('shows only the uncommitted counter when nothing is waiting to be pushed', () => {
        const html = renderGitChip(
            status({ files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true })] }),
            CTX
        );
        assert.ok(html.includes('data-kind="uncommitted"'));
        assert.ok(!html.includes('data-kind="unpushed"'));
    });

    test('collapses to the clean marker when everything is committed and pushed', () => {
        const html = renderGitChip(status({ files: [file({ file: '/repo/notes.md', label: 'notes.md' })] }), CTX);
        assert.ok(html.includes('data-kind="clean"'));
        // The word is a separate span so the compact header can hide it in CSS
        // without a second render pass.
        assert.ok(html.includes('<span class="git-chip-word">clean</span>'));
    });

    test('the tooltip spells out both numbers with plural forms', () => {
        const title = gitChipTitle(
            status({
                files: [
                    file({ file: '/repo/a.md', label: 'a.md', uncommitted: true }),
                    file({ file: '/repo/b.md', label: 'b.md', uncommitted: true }),
                    file({ file: '/repo/c.md', label: 'c.md', unpushed: true })
                ]
            }),
            CTX
        );
        assert.strictEqual(title, '2 files not committed, 1 file not pushed');
    });

    test('russian plural forms follow the count, not the digit', () => {
        const ru: GitHtmlContext = { ...CTX, git: AGENDA_STRINGS.ru.git, uiLang: 'ru', locale: 'ru-RU' };
        const files = Array.from({ length: 5 }, (_, i) =>
            file({ file: `/repo/f${i}.md`, label: `f${i}.md`, uncommitted: true })
        );
        assert.strictEqual(gitChipTitle(status({ files }), ru), 'не закоммичено: 5 файлов');
    });
});

suite('renderGitMenu', () => {
    test('omits a group that has no files', () => {
        const html = renderGitMenu(
            status({ files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true })] }),
            CTX
        );
        assert.ok(html.includes('data-group="uncommitted"'));
        assert.ok(!html.includes('data-group="unpushed"'));
        assert.ok(!html.includes('data-group="clean"'));
        assert.ok(!html.includes('data-group="outside"'));
    });

    test('a file that is both uncommitted and unpushed is listed once, under uncommitted', () => {
        const html = renderGitMenu(
            status({
                files: [file({ file: '/repo/diary.md', label: 'diary.md', uncommitted: true, unpushed: true })]
            }),
            CTX
        );
        assert.strictEqual(html.split('data-file="/repo/diary.md"').length - 1, 1);
        assert.ok(!html.includes('data-group="unpushed"'));
    });

    test('names the commit count and the branch pair for a single repository', () => {
        const html = renderGitMenu(
            status({ files: [file({ file: '/repo/home.md', label: 'home.md', unpushed: true })] }),
            CTX
        );
        assert.ok(html.includes('Not pushed: 1 file in 3 commits (master → origin/master)'), html);
    });

    test('drops the branch detail when the view spans several repositories', () => {
        const other: GitRepoState = { root: '/other', name: 'other', branch: 'main', upstream: 'origin/main' };
        const html = renderGitMenu(
            status({
                repos: [REPO, other],
                files: [
                    file({ file: '/repo/home.md', label: 'home.md', unpushed: true }),
                    file({ file: '/other/plan.md', label: 'plan.md', repoRoot: '/other', unpushed: true })
                ]
            }),
            CTX
        );
        assert.ok(html.includes('Not pushed: 2 files'));
        assert.ok(!html.includes('origin/master'), 'one branch pair cannot describe two repositories');
        // Sub-headings appear only in the multi-repository case.
        assert.ok(html.includes('class="git-repo-title"'));
    });

    test('a single repository gets no sub-headings', () => {
        const html = renderGitMenu(
            status({ files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true })] }),
            CTX
        );
        assert.ok(!html.includes('git-repo-title'));
    });

    test('files outside git survive the per-repository grouping', () => {
        const other: GitRepoState = { root: '/other', name: 'other' };
        const html = renderGitMenu(
            status({
                repos: [REPO, other],
                files: [
                    file({ file: '/repo/work.md', label: 'work.md', uncommitted: true }),
                    { file: '/loose/x.md', label: 'x.md', uncommitted: false, unpushed: false }
                ]
            }),
            CTX
        );
        assert.ok(html.includes('data-file="/loose/x.md"'), 'a file with no repository must still be listed');
    });

    test('shows the commit button only when something is uncommitted', () => {
        const withChanges = renderGitMenu(
            status({ files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true })] }),
            CTX
        );
        assert.ok(withChanges.includes('id="gitCommitBtn"'));
        assert.ok(!withChanges.includes('id="gitPushBtn"'));

        const clean = renderGitMenu(status({ files: [file({ file: '/repo/notes.md', label: 'notes.md' })] }), CTX);
        assert.ok(!clean.includes('id="gitCommitBtn"'));
        assert.ok(!clean.includes('git-actions'));
    });

    test('the push button counts commits, not files', () => {
        const html = renderGitMenu(
            status({ files: [file({ file: '/repo/home.md', label: 'home.md', unpushed: true })] }),
            CTX
        );
        assert.ok(html.includes('>Push 3</button>'), html);
    });

    test('escapes quotes in a path so data-file cannot break out of the attribute', () => {
        const html = renderGitMenu(
            status({
                files: [file({ file: '/repo/a" onclick="alert(1)".md', label: 'a".md', uncommitted: true })]
            }),
            CTX
        );
        assert.ok(!html.includes('onclick="alert(1)"'), 'attribute injection through data-file');
        assert.ok(html.includes('&quot;'));
    });

    test('the tooltip carries the real path when the source is a symlink', () => {
        const html = renderGitMenu(
            status({
                files: [
                    file({
                        file: '/home/user/notes/work.md',
                        realPath: '/repo/work.md',
                        label: 'work.md',
                        uncommitted: true
                    })
                ]
            }),
            CTX
        );
        assert.ok(html.includes('title="Real path: /repo/work.md"'), html);
        assert.ok(html.includes('data-file="/home/user/notes/work.md"'), 'the row must open the path the user knows');
    });
});
