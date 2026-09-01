import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';
import {
    gitChipStats,
    gitUnpushedGroupTitle,
    gitChipTitle,
    gitCounters,
    gitFileMark,
    gitFileMarkTitle,
    gitGlyph,
    renderGitChip,
    renderGitMenu
} from '../../utils/agendaGitHtml';
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
    return { repoRoot: '/repo', uncommitted: false, unpushed: false, conflicted: false, ...partial };
}

/**
 * A source file with no repository at all -- outside git, or inside one VS
 * Code declined to open. `repoRoot` is left out rather than set to undefined:
 * exactOptionalPropertyTypes tells the two apart, and the model omits the key.
 */
function outsideFile(path: string, label: string): GitFileState {
    return { file: path, label, uncommitted: false, unpushed: false, conflicted: false };
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
        conflictCount: files.filter((f) => f.conflicted).length,
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

    test('each counter explains itself, not only the chip as a whole', () => {
        // The chip's own tooltip names every counter at once, which answers
        // "what is the state". A reader pointing at one glyph is asking about
        // that glyph, and four clauses to pick one out of is not an answer.
        const html = renderGitChip(
            status({
                files: [
                    file({ file: '/repo/work.md', label: 'work.md', uncommitted: true }),
                    file({ file: '/repo/home.md', label: 'home.md', unpushed: true })
                ]
            }),
            CTX
        );
        assert.ok(html.includes('data-kind="uncommitted" title="1 file not committed"'));
        assert.ok(html.includes('data-kind="unpushed" title="1 file not pushed"'));
    });

    test('the clean marker carries the sentence the chip does', () => {
        const html = renderGitChip(status({ files: [file({ file: '/repo/notes.md', label: 'notes.md' })] }), CTX);
        assert.ok(html.includes(`title="${AGENDA_STRINGS.en.git.cleanTitle}"`));
    });

    // The regression this pair pins: a file whose repository could not be read
    // is neither uncommitted nor unpushed, and the chip used to answer "clean"
    // for it -- a claim about a file nothing had looked at.
    test('a file with no repository is counted, not passed off as clean', () => {
        const html = renderGitChip(status({ files: [outsideFile('/elsewhere/notes.md', 'notes.md')] }), CTX);
        assert.ok(html.includes('data-kind="outside"'), 'unknown-state stat missing');
        assert.ok(!html.includes('data-kind="clean"'), 'clean marker must not stand for an unread file');
    });

    test('the tooltip names the files whose state could not be read', () => {
        const title = gitChipTitle(
            status({
                files: [
                    file({ file: '/repo/a.md', label: 'a.md', uncommitted: true }),
                    outsideFile('/elsewhere/b.md', 'b.md')
                ]
            }),
            CTX
        );
        assert.strictEqual(
            title,
            '1 file not committed, 1 file outside git, or in a repository VS Code has not opened'
        );
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

    // The chip and its tooltip are two renderings of one list of counters, and
    // the way that goes wrong is silently: a mark on the chip the tooltip never
    // explains, or a sentence about a number the chip does not show.
    test('every counter on the chip is spelled out in the tooltip, and no other', () => {
        const full = status({
            files: [
                file({ file: '/repo/a.md', label: 'a.md', conflicted: true }),
                file({ file: '/repo/b.md', label: 'b.md', uncommitted: true }),
                file({ file: '/repo/c.md', label: 'c.md', unpushed: true }),
                outsideFile('/elsewhere/d.md', 'd.md')
            ]
        });
        const kinds = [...renderGitChip(full, CTX).matchAll(/data-kind="([a-z]+)"/g)].map((hit) => hit[1]);
        assert.deepStrictEqual(kinds, ['conflicted', 'uncommitted', 'unpushed', 'outside']);
        assert.strictEqual(
            gitChipTitle(full, CTX),
            '1 file with unresolved conflicts, 1 file not committed, 1 file not pushed, ' +
                '1 file outside git, or in a repository VS Code has not opened'
        );
    });

    test('russian plural forms follow the count, not the digit', () => {
        const ru: GitHtmlContext = { ...CTX, git: AGENDA_STRINGS.ru.git, uiLang: 'ru', locale: 'ru-RU' };
        const files = Array.from({ length: 5 }, (_, i) =>
            file({ file: `/repo/f${i}.md`, label: `f${i}.md`, uncommitted: true })
        );
        assert.strictEqual(gitChipTitle(status({ files }), ru), 'без коммита: 5 файлов');
    });

    test('russian counts commits by their own three forms', () => {
        // The commit count has its own set of forms, and a missing one shows
        // as a number with nothing after it rather than as "5 undefined".
        const ru: GitHtmlContext = { ...CTX, git: AGENDA_STRINGS.ru.git, uiLang: 'ru', locale: 'ru-RU' };
        const unpushed = [file({ file: '/repo/a.md', label: 'a.md', unpushed: true })];
        const title = (commits: number): string =>
            gitUnpushedGroupTitle(1, status({ files: unpushed, unpushedCommits: commits }), ru);
        // `includes`, not a word-boundary regex: `\b` is an ASCII rule and
        // never matches at the end of a Cyrillic word.
        assert.ok(title(1).includes('1 коммит '), title(1));
        assert.ok(title(2).includes('2 коммита '), title(2));
        assert.ok(title(5).includes('5 коммитов '), title(5));
    });
});

/** The same repository with nothing waiting to be pushed. */
const LEVEL_REPO: GitRepoState = { root: '/repo', name: 'repo', branch: 'master', upstream: 'origin/master' };

suite('renderGitMenu', () => {
    test('omits a group that has no files', () => {
        const html = renderGitMenu(
            status({
                repos: [LEVEL_REPO],
                unpushedCommits: 0,
                files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true })]
            }),
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
                repos: [LEVEL_REPO],
                unpushedCommits: 0,
                files: [file({ file: '/repo/diary.md', label: 'diary.md', uncommitted: true, unpushed: true })]
            }),
            CTX
        );
        assert.strictEqual(html.split('data-file="/repo/diary.md"').length - 1, 1);
        assert.ok(!html.includes('data-group="unpushed"'));
    });

    // The defect behind this one: the group was built from its files alone, so
    // a branch whose only unpushed file was also uncommitted showed no group at
    // all -- and the commits the Push button would send stayed invisible.
    test('the unpushed group appears for commits even when it has no files of its own', () => {
        const html = renderGitMenu(
            status({
                repos: [{ ...REPO, unpushedCommitList: [{ hash: 'abc1234', subject: 'fix the parser' }] }],
                files: [file({ file: '/repo/diary.md', label: 'diary.md', uncommitted: true, unpushed: true })]
            }),
            CTX
        );
        assert.ok(html.includes('data-group="unpushed"'));
        assert.ok(html.includes('fix the parser'), html);
        assert.ok(html.includes('abc1234'));
    });

    test('commits beyond the listed ones are summarised, not dropped', () => {
        const html = renderGitMenu(
            status({
                repos: [
                    {
                        ...REPO,
                        aheadCommits: 30,
                        unpushedCommitList: [{ hash: 'abc1234', subject: 'fix the parser' }]
                    }
                ],
                unpushedCommits: 30,
                files: [file({ file: '/repo/home.md', label: 'home.md', unpushed: true })]
            }),
            CTX
        );
        assert.ok(html.includes('and 29 more'), html);
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
                    outsideFile('/loose/x.md', 'x.md')
                ]
            }),
            CTX
        );
        assert.ok(html.includes('data-file="/loose/x.md"'), 'a file with no repository must still be listed');
    });

    test('shows the commit button only when something is uncommitted', () => {
        const withChanges = renderGitMenu(
            status({
                repos: [LEVEL_REPO],
                unpushedCommits: 0,
                files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true })]
            }),
            CTX
        );
        assert.ok(withChanges.includes('id="gitCommitBtn"'));
        assert.ok(!withChanges.includes('id="gitPushBtn"'));

        const clean = renderGitMenu(
            status({
                repos: [LEVEL_REPO],
                unpushedCommits: 0,
                files: [file({ file: '/repo/notes.md', label: 'notes.md' })]
            }),
            CTX
        );
        assert.ok(!clean.includes('id="gitCommitBtn"'));
        assert.ok(!clean.includes('id="gitPushBtn"'));
    });

    // Sync answers for the side no counter here can see, so it is offered
    // wherever there is a repository -- including the state where the other
    // two buttons are both gone because this side has nothing outstanding.
    test('the sync button is offered whatever the counters say', () => {
        const clean = renderGitMenu(
            status({
                repos: [LEVEL_REPO],
                unpushedCommits: 0,
                files: [file({ file: '/repo/notes.md', label: 'notes.md' })]
            }),
            CTX
        );
        assert.ok(clean.includes('id="gitSyncBtn"'), clean);

        const conflicted = renderGitMenu(
            status({
                repos: [{ ...LEVEL_REPO, conflictCount: 2 }],
                unpushedCommits: 0,
                conflictCount: 2,
                files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true, conflicted: true })]
            }),
            CTX
        );
        // A merge stops the commit, not the fetch: taking what the remote has
        // is exactly what an unresolved merge does not stand in the way of.
        assert.ok(conflicted.includes('id="gitSyncBtn"'), conflicted);
    });

    // Files reachable from no repository at all: there is nothing to fetch
    // for, and a button offering it would be a press that can only report
    // that it did nothing.
    test('no repository means no sync button', () => {
        const html = renderGitMenu(
            status({ repos: [], unpushedCommits: 0, files: [outsideFile('/loose/x.md', 'x.md')] }),
            CTX
        );
        assert.ok(!html.includes('id="gitSyncBtn"'), html);
        assert.ok(!html.includes('git-actions'), html);
    });

    // The button pushes the branch, so what gates it is the commit count. A
    // commit that touched none of this view's files still goes out with it.
    test('the push button appears for commits that touched no file of the view', () => {
        const html = renderGitMenu(status({ files: [file({ file: '/repo/notes.md', label: 'notes.md' })] }), CTX);
        assert.ok(html.includes('id="gitPushBtn"'), html);
    });

    test('the push button counts commits, not files', () => {
        const html = renderGitMenu(
            status({ files: [file({ file: '/repo/home.md', label: 'home.md', unpushed: true })] }),
            CTX
        );
        assert.ok(html.includes('>Push 3</button>'), html);
    });

    // An unresolved merge takes the commit button away: git would refuse the
    // commit, and once the conflicts were staged it would accept one carrying
    // the whole merge -- neither is what a button labelled with this view's
    // file count offers.
    test('a conflict removes the commit button and says why', () => {
        const html = renderGitMenu(
            status({
                repos: [{ ...LEVEL_REPO, conflictCount: 2 }],
                unpushedCommits: 0,
                conflictCount: 2,
                files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true, conflicted: true })]
            }),
            CTX
        );
        assert.ok(!html.includes('id="gitCommitBtn"'), 'the commit button must not survive a conflict');
        assert.ok(html.includes('data-group="conflicted"'), html);
        assert.ok(html.includes('Resolve them in Source Control'), html);
    });

    // The heading counts the repository's conflicts, not the view's: two of the
    // three unresolved paths may well be files this agenda never reads, and a
    // heading saying "1 file" would make the missing button look unexplained.
    test('the conflict heading counts the repository, the rows count the view', () => {
        const html = renderGitMenu(
            status({
                repos: [{ ...LEVEL_REPO, conflictCount: 3 }],
                unpushedCommits: 0,
                conflictCount: 3,
                files: [file({ file: '/repo/work.md', label: 'work.md', conflicted: true })]
            }),
            CTX
        );
        assert.ok(html.includes('Conflicts: 3 files'), html);
        assert.strictEqual(html.split('data-file="/repo/work.md"').length - 1, 1);
        assert.ok(!html.includes('data-group="clean"'), 'a conflicted file is not a clean one');
    });

    test('the chip counts conflicts and never calls them clean', () => {
        const html = renderGitChip(
            status({
                repos: [{ ...LEVEL_REPO, conflictCount: 1 }],
                unpushedCommits: 0,
                conflictCount: 1,
                files: [file({ file: '/repo/work.md', label: 'work.md', conflicted: true })]
            }),
            CTX
        );
        assert.ok(html.includes('data-kind="conflicted"'), html);
        assert.ok(!html.includes('data-kind="clean"'));
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

/**
 * Every function in this module is written to run inside the page, and gets
 * there only by being listed in the panel's `INLINED_HELPERS`. A function that
 * is missing from that list is not a compile error and not a wrong string: it
 * is a `ReferenceError` at render time, which takes the whole chip -- and with
 * it every group and both buttons -- off the header.
 *
 * That is exactly how `gitConflictedGroup` arrived: written, called from
 * `gitGroups`, covered by unit tests that call it directly, and invisible in
 * the panel. The check reads the two sources rather than a rendered page, so it
 * fails in the unit suite, seconds after the omission is made.
 */
suite('one set of state marks', () => {
    test('a file row wears the mark its counter wears in the chip', () => {
        // The two used to be two sets of literals, so a chip counting "!" and a
        // row marked "⚠" was a valid state of the code.
        const cases: { file: GitFileState; kind: string }[] = [
            { file: file({ file: '/repo/c.md', label: 'c.md', conflicted: true }), kind: 'conflicted' },
            { file: file({ file: '/repo/u.md', label: 'u.md', uncommitted: true }), kind: 'uncommitted' },
            { file: file({ file: '/repo/p.md', label: 'p.md', unpushed: true }), kind: 'unpushed' },
            { file: outsideFile('/loose/o.md', 'o.md'), kind: 'outside' }
        ];
        for (const { file: state, kind } of cases) {
            const counter = gitCounters(
                status({
                    files: [state],
                    conflictCount: state.conflicted ? 1 : 0,
                    uncommittedCount: state.uncommitted ? 1 : 0,
                    unpushedCount: state.unpushed ? 1 : 0,
                    outsideGitCount: state.repoRoot === undefined ? 1 : 0
                }),
                CTX
            ).find((c) => c.kind === kind);
            assert.ok(counter, `no counter for ${kind}`);
            assert.strictEqual(gitFileMark(state), counter.mark, `${kind}: row and chip disagree`);
        }
    });

    test('a file with nothing pending is the clean mark, as the chip is', () => {
        const clean = file({ file: '/repo/ok.md', label: 'ok.md' });
        assert.strictEqual(gitFileMark(clean), gitGlyph('clean'));
        assert.match(gitChipStats(status({ files: [clean] }), CTX), new RegExp(gitGlyph('clean')));
    });

    test('the mark says in words what its glyph stands for', () => {
        const g = AGENDA_STRINGS.en.git;
        assert.strictEqual(
            gitFileMarkTitle(file({ file: '/repo/a.md', label: 'a.md', conflicted: true }), CTX),
            g.markConflicted
        );
        assert.strictEqual(
            gitFileMarkTitle(file({ file: '/repo/b.md', label: 'b.md', uncommitted: true }), CTX),
            g.markUncommitted
        );
        assert.strictEqual(
            gitFileMarkTitle(file({ file: '/repo/c.md', label: 'c.md', unpushed: true }), CTX),
            g.markUnpushed
        );
        assert.strictEqual(gitFileMarkTitle(outsideFile('/elsewhere/d.md', 'd.md'), CTX), g.markOutside);
        assert.strictEqual(gitFileMarkTitle(file({ file: '/repo/e.md', label: 'e.md' }), CTX), g.markClean);
    });

    test('the wording follows the glyph when a file is in more than one state', () => {
        // gitFileMark picks the conflicted glyph for a file that is also
        // uncommitted; the two must not answer from different rules.
        const both = file({ file: '/repo/f.md', label: 'f.md', conflicted: true, uncommitted: true });
        assert.strictEqual(gitFileMark(both), gitGlyph('conflicted'));
        assert.strictEqual(gitFileMarkTitle(both, CTX), AGENDA_STRINGS.en.git.markConflicted);
    });

    test('the row carries both tooltips: the path on the button, the state on the mark', () => {
        const html = renderGitMenu(
            status({ files: [file({ file: '/repo/work.md', label: 'work.md', uncommitted: true })] }),
            CTX
        );
        assert.ok(html.includes('title="Open /repo/work.md"'), 'the row must still name the path');
        assert.ok(
            html.includes(`<span class="git-file-mark" title="${AGENDA_STRINGS.en.git.markUncommitted}">`),
            'the mark must say what it stands for'
        );
    });
});

suite('agendaGitHtml is fully handed to the page', () => {
    test('every exported function is listed in the panel INLINED_HELPERS', () => {
        const root = path.join(__dirname, '..', '..', '..');
        const source = fs.readFileSync(path.join(root, 'src', 'utils', 'agendaGitHtml.ts'), 'utf-8');
        const panel = fs.readFileSync(path.join(root, 'src', 'views', 'agendaPanel.ts'), 'utf-8');
        const helpers = /INLINED_HELPERS = \{([\s\S]*?)\n {4}\} satisfies/.exec(panel);
        assert.ok(helpers, 'could not find the INLINED_HELPERS literal in agendaPanel.ts');
        const listed = new Set(
            helpers[1]!
                .split('\n')
                .map((line) => /^\s*([A-Za-z0-9_$]+),?\s*$/.exec(line)?.[1])
                .filter((name): name is string => name !== undefined)
        );

        const exported = [...source.matchAll(/^export function ([A-Za-z0-9_$]+)/gm)].map((m) => m[1]!);
        assert.ok(exported.length >= 15, `expected the module's helpers, found ${exported.length}`);
        const missing = exported.filter((name) => !listed.has(name));
        assert.deepStrictEqual(missing, [], `not inlined into the page: ${missing.join(', ')}`);
    });
});
