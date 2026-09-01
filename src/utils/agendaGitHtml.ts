/**
 * HTML for the git-status chip in the agenda header and the list it expands to.
 *
 * Same arrangement as the sibling `agenda*Html.ts` modules: the page runs in a
 * webview no coverage runner instruments, so the markup takes the dictionary,
 * the locale and the plural helpers as parameters instead of reading them off
 * the client's closure, and the unit suite covers it directly.
 *
 * Inlined into the page through `Function.prototype.toString()`: a body may
 * only touch its own parameters and functions defined in this module. No value
 * imports -- a cross-module call compiles to `module_1.fn`, undefined in the
 * page. That is also why the repository label arrives pre-computed in the
 * model: `node:path` does not exist here.
 *
 * The chip reuses the `.tag-menu` shell of the file-tag dropdown, which is what
 * gives it open/close behaviour (`toggleMenu` and the document-level collapse
 * in the client) without a second set of handlers.
 */
import type { AgendaGitStatus, GitFileState, GitRepoState } from '../types';
import type { EscapeHtml, FormatNumber, FormatString, PluralIndex } from './agendaSummaryHtml';
import type { AgendaStrings } from './agendaI18n';

export type GitStrings = AgendaStrings['git'];

/** What the chip and the list need beyond the status itself. */
export interface GitHtmlContext {
    git: GitStrings;
    locale: string;
    uiLang: string;
    escapeHtml: EscapeHtml;
    formatString: FormatString;
    formatNumber: FormatNumber;
    pluralIndex: PluralIndex;
}

/** `3 files` / `3 файла`: digits follow the date locale, the form the UI language. */
export function gitCount(n: number, forms: string[], ctx: GitHtmlContext): string {
    return `${ctx.formatNumber(n, ctx.locale)} ${forms[ctx.pluralIndex(n, ctx.uiLang)] ?? ''}`;
}

/** One counter of the chip: its mark, its number, and the words for its tooltip. */
export interface GitCounter {
    kind: string;
    mark: string;
    count: number;
    title: string;
}

/**
 * The counters worth showing, in the order the chip shows them.
 *
 * One list for the marks and the tooltip: the two used to be four `if` blocks
 * each, and the way that goes wrong is silently -- a counter added to one half
 * and not to the other leaves a mark on the chip that its tooltip never
 * explains. Conflicts lead because they are the one state that stops the
 * panel's own buttons.
 *
 * A function rather than a constant: the page gets these bodies through
 * `Function.prototype.toString()`, and a module-level value is not carried
 * across with them.
 */
export function gitCounters(status: AgendaGitStatus, ctx: GitHtmlContext): GitCounter[] {
    const g = ctx.git;
    return [
        { kind: 'conflicted', mark: gitGlyph('conflicted'), count: status.conflictCount, title: g.conflictedTitle },
        {
            kind: 'uncommitted',
            mark: gitGlyph('uncommitted'),
            count: status.uncommittedCount,
            title: g.uncommittedTitle
        },
        { kind: 'unpushed', mark: gitGlyph('unpushed'), count: status.unpushedCount, title: g.unpushedTitle },
        { kind: 'outside', mark: gitGlyph('outside'), count: status.outsideGitCount, title: g.outsideTitle }
    ].filter((counter) => counter.count > 0);
}

/**
 * The mark that stands for a git state, wherever it is drawn.
 *
 * One place for the five: the chip's counters and the marker on a file row say
 * the same thing about the same file, and they used to say it from two sets of
 * literals -- changing "!" for "⚠" meant finding both, and nothing failed when
 * only one was found.
 */
export function gitGlyph(kind: string): string {
    if (kind === 'conflicted') {
        return '!';
    }
    if (kind === 'uncommitted') {
        return '●';
    }
    if (kind === 'unpushed') {
        return '↑';
    }
    if (kind === 'outside') {
        return '?';
    }
    return '✓';
}

/**
 * Which state a file row shows, in the order the panel ranks them: what blocks
 * the commit, then what is waiting for one, then what is waiting for a push,
 * then what could not be read at all.
 */
export function gitFileMark(file: GitFileState): string {
    if (file.conflicted) {
        return gitGlyph('conflicted');
    }
    if (file.uncommitted) {
        return gitGlyph('uncommitted');
    }
    if (file.unpushed) {
        return gitGlyph('unpushed');
    }
    if (file.repoRoot === undefined) {
        return gitGlyph('outside');
    }
    return gitGlyph('clean');
}

/**
 * What that mark says, in words.
 *
 * The row is a button whose tooltip names the path, so the glyph — the half
 * that says what is wrong with the path — was the part with no wording at all.
 * The order below is the order `gitFileMark` picks its glyph in, and it has to
 * stay that way: a conflicted file is also uncommitted, and the two answers
 * would disagree the moment they were resolved apart.
 */
export function gitFileMarkTitle(file: GitFileState, ctx: GitHtmlContext): string {
    const g = ctx.git;
    if (file.conflicted) {
        return g.markConflicted;
    }
    if (file.uncommitted) {
        return g.markUncommitted;
    }
    if (file.unpushed) {
        return g.markUnpushed;
    }
    return file.repoRoot === undefined ? g.markOutside : g.markClean;
}

/**
 * The collapsed chip.
 *
 * The word next to the clean checkmark sits in its own span so the stylesheet
 * can address it: the layout mode is decided from a measured height after the
 * render, so anything that depends on it has to be reachable from CSS -- text
 * decided here would cost a second render pass on every reflow.
 */
export function renderGitChip(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const title = ctx.escapeHtml(gitChipTitle(status, ctx));
    return (
        `<button class="tag-menu-btn git-chip" id="gitMenuBtn" title="${title}" aria-label="${title}">` +
        gitChipStats(status, ctx) +
        '</button>'
    );
}

/**
 * The stat spans inside the chip: up to four counters, or the clean marker.
 *
 * `!` leads because it is the state that takes the commit button away, then
 * `●` and `↑` for what is waiting to be committed and pushed. `?` is what keeps
 * the rest honest: a file whose repository could not be read reports neither
 * uncommitted nor unpushed, and a chip built from those alone then says "clean"
 * about a file nothing looked at -- which is how a notes repository VS Code
 * declines to open (see gitApi.ts) passed for a tidy one.
 */
export function gitChipStats(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    if (isGitClean(status)) {
        return (
            `<span class="git-chip-stat" data-kind="clean" title="${ctx.escapeHtml(g.cleanTitle)}">✓` +
            `<span class="git-chip-word">${ctx.escapeHtml(g.clean)}</span></span>`
        );
    }
    // Each counter carries the same sentence it contributes to the chip's own
    // tooltip. The chip names all of them at once, which is the answer to
    // "what is the state"; a reader pointing at one glyph is asking about that
    // glyph, and reading four clauses to find the one is not an answer.
    return gitCounters(status, ctx)
        .map((counter) => {
            const title = ctx.escapeHtml(ctx.formatString(counter.title, gitCount(counter.count, g.files, ctx)));
            return (
                `<span class="git-chip-stat" data-kind="${counter.kind}" title="${title}">${counter.mark}` +
                `<b>${ctx.escapeHtml(ctx.formatNumber(counter.count, ctx.locale))}</b></span>`
            );
        })
        .join('');
}

/**
 * Nothing to report: every counter is zero.
 *
 * One predicate for the chip and its tooltip, because the two disagreeing is
 * exactly the bug this shape prevents -- a chip saying "clean" with a tooltip
 * that lists conflicts, or the reverse.
 */
export function isGitClean(status: AgendaGitStatus): boolean {
    return (
        status.uncommittedCount === 0 &&
        status.unpushedCount === 0 &&
        status.outsideGitCount === 0 &&
        status.conflictCount === 0
    );
}

/** Tooltip of the chip: the same numbers, spelled out. */
export function gitChipTitle(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    if (isGitClean(status)) {
        return g.cleanTitle;
    }
    return gitCounters(status, ctx)
        .map((counter) => ctx.formatString(counter.title, gitCount(counter.count, g.files, ctx)))
        .join(g.titleSeparator);
}

/**
 * The whole dropdown: chip plus list. Rendered as one node so the client can
 * replace it wholesale when a new status arrives, without disturbing the rest
 * of the header.
 */
export function renderGitMenu(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    return (
        '<div class="tag-menu git-menu" id="gitMenu">' +
        renderGitChip(status, ctx) +
        '<div class="tag-menu-list git-menu-list">' +
        `<div class="tag-menu-label">${ctx.escapeHtml(ctx.git.caption)}</div>` +
        gitGroups(status, ctx) +
        gitActions(status, ctx) +
        '</div></div>'
    );
}

/** The five groups, each omitted when empty. */
export function gitGroups(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    const conflicted = status.files.filter((f) => f.conflicted);
    const uncommitted = status.files.filter((f) => f.uncommitted && !f.conflicted);
    const unpushed = status.files.filter((f) => f.unpushed && !f.uncommitted && !f.conflicted);
    const clean = status.files.filter(
        (f) => f.repoRoot !== undefined && !f.uncommitted && !f.unpushed && !f.conflicted
    );
    const outside = status.files.filter((f) => f.repoRoot === undefined);

    return (
        gitConflictedGroup(conflicted, status, ctx) +
        gitGroup(
            'uncommitted',
            ctx.formatString(g.uncommittedGroup, gitCount(uncommitted.length, g.files, ctx)),
            uncommitted,
            status,
            ctx
        ) +
        gitUnpushedGroup(unpushed, status, ctx) +
        gitGroup('clean', ctx.formatString(g.cleanGroup, gitCount(clean.length, g.files, ctx)), clean, status, ctx) +
        gitGroup(
            'outside',
            ctx.formatString(g.outsideGroup, gitCount(outside.length, g.files, ctx)),
            outside,
            status,
            ctx
        )
    );
}

/**
 * The conflict group: what a merge left unresolved, and what to do about it.
 *
 * Its heading counts the repository's conflicts, not the view's: the commit
 * button disappears because the repository is mid-merge, and a heading that
 * said "1 file" while three stand unresolved would make the missing button
 * look like a different fault. Files of the view that conflict are still listed
 * -- they are the ones the user recognises -- and the hint row names where the
 * rest are resolved, because this extension deliberately does not resolve them.
 */
export function gitConflictedGroup(
    files: readonly GitFileState[],
    status: AgendaGitStatus,
    ctx: GitHtmlContext
): string {
    if (status.conflictCount === 0) {
        return '';
    }
    const g = ctx.git;
    const title = ctx.formatString(g.conflictedGroup, gitCount(status.conflictCount, g.files, ctx));
    const body =
        status.repos.length > 1
            ? gitFilesByRepository(files, status.repos, ctx)
            : gitFileRows(files, 'conflicted', ctx);
    return (
        '<div class="git-group" data-group="conflicted">' +
        `<div class="git-group-title">${ctx.escapeHtml(title)}</div>` +
        body +
        `<div class="git-note">${ctx.escapeHtml(g.conflictedHint)}</div>` +
        '</div>'
    );
}

/**
 * "Not pushed: 1 file in 3 commits (master -> origin/master)".
 *
 * The commit count and the branch pair are only named when the view sits in a
 * single repository: with several, one branch name would describe none of them,
 * and the per-repository detail already appears as the group's sub-headings.
 */
export function gitUnpushedGroupTitle(fileCount: number, status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    const files = gitCount(fileCount, g.files, ctx);
    const repo = status.repos.length === 1 ? status.repos[0] : undefined;
    if (!repo?.upstream || !repo.branch || status.unpushedCommits === 0) {
        return ctx.formatString(g.unpushedGroup, files);
    }
    return ctx.formatString(
        g.unpushedGroupDetailed,
        files,
        gitCount(status.unpushedCommits, g.commits, ctx),
        repo.branch,
        repo.upstream
    );
}

/**
 * The unpushed group: the commits Push would send, then the files they touched.
 *
 * Commits come first because they are what the button acts on -- it says
 * "Push 3", and until now nothing in the panel showed which three. They are
 * also why this group has its own renderer rather than sharing `gitGroup`: it
 * appears whenever there is something to push, even with no file of its own.
 * A source file that is uncommitted *and* unpushed is listed under
 * "Not committed", and the group used to vanish with it, hiding commits that
 * were still waiting to go.
 */
export function gitUnpushedGroup(files: readonly GitFileState[], status: AgendaGitStatus, ctx: GitHtmlContext): string {
    if (files.length === 0 && status.unpushedCommits === 0) {
        return '';
    }
    const title = gitUnpushedGroupTitle(files.length, status, ctx);
    const body =
        status.repos.length > 1
            ? gitUnpushedByRepository(files, status, ctx)
            : gitCommitRows(status.repos[0], ctx) + gitFileRows(files, 'unpushed', ctx);
    return (
        '<div class="git-group" data-group="unpushed">' +
        `<div class="git-group-title">${ctx.escapeHtml(title)}</div>` +
        body +
        '</div>'
    );
}

/**
 * Per repository: its heading, its commits, then its files.
 *
 * The same walk as {@link gitFilesByRepository} with the commit rows put
 * between the heading and the files -- so it is that function, called with
 * them. Written as two loops before, and the two had drifted: only one of them
 * printed the files that belong to no repository at all.
 */
export function gitUnpushedByRepository(
    files: readonly GitFileState[],
    status: AgendaGitStatus,
    ctx: GitHtmlContext
): string {
    return gitFilesByRepository(files, status.repos, ctx, (repo) => gitCommitRows(repo, ctx));
}

/**
 * One row per listed commit, and a last row for the ones left out.
 *
 * Rows are plain elements, not buttons: unlike a file row there is nothing to
 * open, and a control that answers nothing invites the click it cannot serve.
 */
export function gitCommitRows(repo: GitRepoState | undefined, ctx: GitHtmlContext): string {
    const commits = repo?.unpushedCommitList ?? [];
    if (commits.length === 0) {
        return '';
    }
    const rows = commits
        .map(
            (commit) =>
                '<div class="git-commit" title="' +
                `${ctx.escapeHtml(commit.subject)}">` +
                `<span class="git-commit-hash">${ctx.escapeHtml(commit.hash)}</span>` +
                `<span class="git-commit-subject">${ctx.escapeHtml(commit.subject)}</span></div>`
        )
        .join('');
    const hidden = (repo?.aheadCommits ?? commits.length) - commits.length;
    const more =
        hidden > 0
            ? '<div class="git-commit git-commit-more">' +
              `${ctx.escapeHtml(ctx.formatString(ctx.git.moreCommits, ctx.formatNumber(hidden, ctx.locale)))}</div>`
            : '';
    return `<div class="git-commits">${rows}${more}</div>`;
}

/** One group: a title, then its files, sub-grouped by repository when several. */
export function gitGroup(
    kind: string,
    title: string,
    files: readonly GitFileState[],
    status: AgendaGitStatus,
    ctx: GitHtmlContext
): string {
    if (files.length === 0) {
        return '';
    }
    const body =
        status.repos.length > 1 ? gitFilesByRepository(files, status.repos, ctx) : gitFileRows(files, kind, ctx);
    return (
        `<div class="git-group" data-group="${kind}">` +
        `<div class="git-group-title">${ctx.escapeHtml(title)}</div>` +
        body +
        '</div>'
    );
}

/**
 * Sub-headings per repository, in the model's (root-sorted) order.
 *
 * `before` puts something of the repository's own between its heading and its
 * files -- the unpushed group passes its commit rows -- and a repository with
 * nothing but that is still worth a heading, which is why it also decides
 * whether an otherwise empty repository is skipped.
 */
export function gitFilesByRepository(
    files: readonly GitFileState[],
    repos: readonly GitRepoState[],
    ctx: GitHtmlContext,
    before?: (repo: GitRepoState) => string
): string {
    let html = '';
    for (const repo of repos) {
        const own = files.filter((f) => f.repoRoot === repo.root);
        const extra = before ? before(repo) : '';
        if (own.length === 0 && extra === '') {
            continue;
        }
        html +=
            `<div class="git-repo-title" title="${ctx.escapeHtml(repo.root)}">${ctx.escapeHtml(repo.name)}</div>` +
            extra +
            gitFileRows(own, 'repo', ctx);
    }
    // Files outside git have no repository to sit under and would vanish here.
    const loose = files.filter((f) => f.repoRoot === undefined);
    return html + (loose.length > 0 ? gitFileRows(loose, 'repo', ctx) : '');
}

/**
 * File rows. Each is a button so it takes Tab focus and Enter/Space activation,
 * matching the tag rows next to it; `data-file` carries the path the client
 * sends back to open the file.
 */
export function gitFileRows(files: readonly GitFileState[], kind: string, ctx: GitHtmlContext): string {
    return files
        .map((file) => {
            const mark = gitFileMark(file);
            const title = file.realPath
                ? ctx.formatString(ctx.git.realPathTitle, file.realPath)
                : ctx.formatString(ctx.git.openFileTitle, file.file);
            return (
                `<button type="button" class="git-file" data-kind="${ctx.escapeHtml(kind)}" ` +
                `data-file="${ctx.escapeHtml(file.file)}" title="${ctx.escapeHtml(title)}">` +
                `<span class="git-file-mark" title="${ctx.escapeHtml(gitFileMarkTitle(file, ctx))}">${mark}</span>` +
                `<span class="git-file-name">${ctx.escapeHtml(file.label)}</span></button>`
            );
        })
        .join('');
}

/**
 * Sync, commit, commit-and-sync, and push. The counted ones are dropped when
 * their counter is zero -- an always-visible "Commit 0 files" invites a click
 * that can only fail -- and sync is offered wherever there is a repository at
 * all, because what it is for is the commits on the other side, which no
 * counter here can see.
 *
 * Sync comes first so that it stays put: the other two appear and vanish with
 * the state of the view, and a button that moves under the pointer between one
 * render and the next is a button pressed by accident.
 *
 * Commit is also dropped while a merge is unresolved. Git would refuse the
 * commit anyway, but the refusal arrives as its own message about paths the
 * user never chose here; worse, once the conflicts are staged git accepts the
 * commit and takes the whole merge with it, which is not what a button labelled
 * with the view's file count offers. The conflict group above states the reason
 * in place of the button.
 */
export function gitActions(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    let html = '';
    if (status.repos.length > 0) {
        html +=
            `<button type="button" class="git-action" id="gitSyncBtn" title="${ctx.escapeHtml(g.syncButtonTitle)}">` +
            `${ctx.escapeHtml(g.syncButton)}</button>`;
    }
    if (status.uncommittedCount > 0 && status.conflictCount === 0) {
        const count = ctx.formatNumber(status.uncommittedCount, ctx.locale);
        const label = ctx.formatString(g.commitButton, count);
        html +=
            `<button type="button" class="git-action" id="gitCommitBtn" title="${ctx.escapeHtml(g.commitButtonTitle)}">` +
            `${ctx.escapeHtml(label)}</button>`;
        // Under the commit it extends, and gated on the same counters: what it
        // adds is the sync, and a sync alone is already the button above them.
        const both = ctx.formatString(g.commitSyncButton, count);
        html +=
            '<button type="button" class="git-action" id="gitCommitSyncBtn" ' +
            `title="${ctx.escapeHtml(g.commitSyncButtonTitle)}">${ctx.escapeHtml(both)}</button>`;
    }
    // Gated on the commits, not on the files: the button pushes commits, and a
    // branch can be ahead by a commit that touched no file of this view.
    if (status.unpushedCommits > 0) {
        const label = ctx.formatString(g.pushButton, ctx.formatNumber(status.unpushedCommits, ctx.locale));
        html +=
            `<button type="button" class="git-action" id="gitPushBtn" title="${ctx.escapeHtml(g.pushButtonTitle)}">` +
            `${ctx.escapeHtml(label)}</button>`;
    }
    return html ? `<div class="git-actions">${html}</div>` : '';
}
