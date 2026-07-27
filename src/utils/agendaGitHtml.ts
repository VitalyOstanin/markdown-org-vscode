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

/** The stat spans inside the chip: two counters, or the clean marker. */
export function gitChipStats(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    if (status.uncommittedCount === 0 && status.unpushedCount === 0) {
        return (
            '<span class="git-chip-stat" data-kind="clean">✓' +
            `<span class="git-chip-word">${ctx.escapeHtml(g.clean)}</span></span>`
        );
    }
    let html = '';
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
    return html;
}

/** Tooltip of the chip: the same two numbers, spelled out. */
export function gitChipTitle(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    if (status.uncommittedCount === 0 && status.unpushedCount === 0) {
        return g.cleanTitle;
    }
    const parts: string[] = [];
    if (status.uncommittedCount > 0) {
        parts.push(ctx.formatString(g.uncommittedTitle, gitCount(status.uncommittedCount, g.files, ctx)));
    }
    if (status.unpushedCount > 0) {
        parts.push(ctx.formatString(g.unpushedTitle, gitCount(status.unpushedCount, g.files, ctx)));
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

/** The four groups, each omitted when empty. */
export function gitGroups(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    const uncommitted = status.files.filter((f) => f.uncommitted);
    const unpushed = status.files.filter((f) => f.unpushed && !f.uncommitted);
    const clean = status.files.filter((f) => f.repoRoot !== undefined && !f.uncommitted && !f.unpushed);
    const outside = status.files.filter((f) => f.repoRoot === undefined);

    return (
        gitGroup(
            'uncommitted',
            ctx.formatString(g.uncommittedGroup, gitCount(uncommitted.length, g.files, ctx)),
            uncommitted,
            status,
            ctx
        ) +
        gitGroup('unpushed', gitUnpushedGroupTitle(unpushed.length, status, ctx), unpushed, status, ctx) +
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
            const mark = file.uncommitted ? '●' : file.unpushed ? '↑' : file.repoRoot === undefined ? '?' : '✓';
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
 */
export function gitActions(status: AgendaGitStatus, ctx: GitHtmlContext): string {
    const g = ctx.git;
    let html = '';
    if (status.uncommittedCount > 0) {
        const label = ctx.formatString(g.commitButton, ctx.formatNumber(status.uncommittedCount, ctx.locale));
        html +=
            `<button type="button" class="git-action" id="gitCommitBtn" title="${ctx.escapeHtml(g.commitButtonTitle)}">` +
            `${ctx.escapeHtml(label)}</button>`;
    }
    if (status.unpushedCount > 0) {
        const label = ctx.formatString(g.pushButton, ctx.formatNumber(status.unpushedCommits, ctx.locale));
        html +=
            `<button type="button" class="git-action" id="gitPushBtn" title="${ctx.escapeHtml(g.pushButtonTitle)}">` +
            `${ctx.escapeHtml(label)}</button>`;
    }
    return html ? `<div class="git-actions">${html}</div>` : '';
}
