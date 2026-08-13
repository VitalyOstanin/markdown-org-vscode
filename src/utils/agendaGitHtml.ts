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
 * The stat spans inside the chip: up to three counters, or the clean marker.
 *
 * The third counter is what keeps the first two honest. A file whose
 * repository could not be read reports neither uncommitted nor unpushed, and a
 * chip built from those two alone then says "clean" about a file nothing
 * looked at -- which is how a notes repository VS Code declines to open (see
 * gitApi.ts) passed for a tidy one.
 */
export function gitChipStats(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    if (isGitClean(status)) {
        return (
            '<span class="git-chip-stat" data-kind="clean">✓' +
            `<span class="git-chip-word">${ctx.escapeHtml(g.clean)}</span></span>`
        );
    }
    let html = '';
    // Conflicts lead: they are the one state that stops the panel's own
    // buttons, so a chip that mentions them last would read as an afterthought.
    if (status.conflictCount > 0) {
        html +=
            '<span class="git-chip-stat" data-kind="conflicted">!' +
            `<b>${ctx.escapeHtml(ctx.formatNumber(status.conflictCount, ctx.locale))}</b></span>`;
    }
    if (status.uncommittedCount > 0) {
        html +=
            '<span class="git-chip-stat" data-kind="uncommitted">●' +
            `<b>${ctx.escapeHtml(ctx.formatNumber(status.uncommittedCount, ctx.locale))}</b></span>`;
    }
    if (status.unpushedCount > 0) {
        html +=
            '<span class="git-chip-stat" data-kind="unpushed">↑' +
            `<b>${ctx.escapeHtml(ctx.formatNumber(status.unpushedCount, ctx.locale))}</b></span>`;
    }
    if (status.outsideGitCount > 0) {
        html +=
            '<span class="git-chip-stat" data-kind="outside">?' +
            `<b>${ctx.escapeHtml(ctx.formatNumber(status.outsideGitCount, ctx.locale))}</b></span>`;
    }
    return html;
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
    const parts: string[] = [];
    if (status.conflictCount > 0) {
        parts.push(ctx.formatString(g.conflictedTitle, gitCount(status.conflictCount, g.files, ctx)));
    }
    if (status.uncommittedCount > 0) {
        parts.push(ctx.formatString(g.uncommittedTitle, gitCount(status.uncommittedCount, g.files, ctx)));
    }
    if (status.unpushedCount > 0) {
        parts.push(ctx.formatString(g.unpushedTitle, gitCount(status.unpushedCount, g.files, ctx)));
    }
    if (status.outsideGitCount > 0) {
        parts.push(ctx.formatString(g.outsideTitle, gitCount(status.outsideGitCount, g.files, ctx)));
    }
    return parts.join(g.titleSeparator);
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

/** Per repository: its heading, its commits, then its files. */
export function gitUnpushedByRepository(
    files: readonly GitFileState[],
    status: AgendaGitStatus,
    ctx: GitHtmlContext
): string {
    let html = '';
    for (const repo of status.repos) {
        const own = files.filter((f) => f.repoRoot === repo.root);
        const commits = gitCommitRows(repo, ctx);
        if (own.length === 0 && commits === '') {
            continue;
        }
        html +=
            `<div class="git-repo-title" title="${ctx.escapeHtml(repo.root)}">${ctx.escapeHtml(repo.name)}</div>` +
            commits +
            gitFileRows(own, 'repo', ctx);
    }
    return html;
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

/** Sub-headings per repository, in the model's (root-sorted) order. */
export function gitFilesByRepository(
    files: readonly GitFileState[],
    repos: readonly GitRepoState[],
    ctx: GitHtmlContext
): string {
    let html = '';
    for (const repo of repos) {
        const own = files.filter((f) => f.repoRoot === repo.root);
        if (own.length === 0) {
            continue;
        }
        html +=
            `<div class="git-repo-title" title="${ctx.escapeHtml(repo.root)}">${ctx.escapeHtml(repo.name)}</div>` +
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
            const mark = file.conflicted
                ? '!'
                : file.uncommitted
                  ? '●'
                  : file.unpushed
                    ? '↑'
                    : file.repoRoot === undefined
                      ? '?'
                      : '✓';
            const title = file.realPath
                ? ctx.formatString(ctx.git.realPathTitle, file.realPath)
                : ctx.formatString(ctx.git.openFileTitle, file.file);
            return (
                `<button type="button" class="git-file" data-kind="${ctx.escapeHtml(kind)}" ` +
                `data-file="${ctx.escapeHtml(file.file)}" title="${ctx.escapeHtml(title)}">` +
                `<span class="git-file-mark">${mark}</span>` +
                `<span class="git-file-name">${ctx.escapeHtml(file.label)}</span></button>`
            );
        })
        .join('');
}

/**
 * Commit and push. Each button is dropped when its counter is zero -- an
 * always-visible "Commit 0 files" invites a click that can only fail.
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
    if (status.uncommittedCount > 0 && status.conflictCount === 0) {
        const label = ctx.formatString(g.commitButton, ctx.formatNumber(status.uncommittedCount, ctx.locale));
        html +=
            `<button type="button" class="git-action" id="gitCommitBtn" title="${ctx.escapeHtml(g.commitButtonTitle)}">` +
            `${ctx.escapeHtml(label)}</button>`;
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
