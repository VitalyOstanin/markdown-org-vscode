/**
 * Commit and push the agenda's source files, from the panel's git dropdown.
 *
 * Scope is the point of these two: the commit stages exactly the changed files
 * the current view is built from, so an unrelated edit elsewhere in the same
 * repository is not swept into a commit the user thinks is about their notes.
 * That is why `repo.add()` is given an explicit path list rather than the
 * commit being run with `all: true`.
 *
 * The staging is ours to control; the commit is not. `commit()` takes a message
 * and no paths (`CommitOptions` has none), so it writes whatever the index
 * holds -- including a file the user staged in Source Control beforehand. That
 * case cannot be narrowed away, so it is asked about instead, before the
 * message is typed.
 *
 * Paths handed to git are the resolved ones: `git add` runs with the repository
 * root as its working directory and will not accept a symlink path from outside
 * that root (see ADR-0016).
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import { getGitApi, resolveRepositoryFor } from '../utils/git/gitApi';
import type { GitRepository } from '../utils/git/gitApiTypes';
import { pathKey } from '../utils/git/gitPathMatch';
import { canonicalPath, changeKeys, repositoryRoots } from '../utils/git/repositoryPaths';
import { formatError, notifyError, notifyStatus } from '../utils/notify';
import { logDiagnostic } from '../utils/logChannel';
import { formatString, pluralIndex } from '../utils/agendaI18n';
import type { AgendaStrings, UiLanguage } from '../utils/agendaI18n';
import { toIsoDate } from '../utils/isoDate';

/** Files grouped by the repository that will commit them. */
type FilesByRepository = Map<GitRepository, string[]>;

/** One repository the commit will actually write to. */
interface CommitTarget {
    repository: GitRepository;
    /** View files git reports as changed -- the ones the commit is asked for. */
    changed: string[];
    /** Staged paths this view does not name -- the ones it would carry anyway. */
    foreignStaged: number;
}

/**
 * The error code the built-in extension attaches when the remote refuses a
 * non-fast-forward update. Read as a plain property because the API surface we
 * declare describes calls, not the errors they throw.
 */
const PUSH_REJECTED_CODE = 'PushRejected';

/**
 * Text of the same refusal, for the paths that do not carry the code -- an
 * older host, or a rejection reported by the remote's own hook rather than by
 * git's ref check. Same reason the mobile client watches two signals for it.
 */
const PUSH_REJECTED_TEXT = /!\s*\[rejected]|non-fast-forward|fetch first|failed to push some refs/i;

/**
 * Stage the given source files and commit them under one message.
 *
 * The message is asked for once and reused across repositories: the files came
 * from a single agenda view, and making the user retype the same sentence per
 * repository would be the wrong kind of precision.
 */
export async function commitAgendaSources(
    files: readonly string[],
    strings: AgendaStrings,
    language: UiLanguage
): Promise<void> {
    const realPathCache = new Map<string, string>();
    const grouped = await groupByRepository(files, realPathCache);
    if (grouped.size === 0) {
        return;
    }

    // Checked before the message is asked for: typing a commit message only to
    // be told it cannot be used is the wrong order of a refusal. The panel
    // normally hides the button already, but its status is a snapshot and the
    // merge may have started since.
    const conflicted = [...grouped.keys()].find((repository) => hasConflicts(repository));
    if (conflicted) {
        notifyError(formatString(strings.git.commitConflicts, path.basename(conflicted.rootUri.fsPath)));
        return;
    }

    // A repository whose files are all committed already is left out entirely:
    // `commit` refuses an empty index, and that refusal used to abort the whole
    // round, leaving the repositories after it uncommitted.
    const targets = await commitTargets(grouped, realPathCache);
    if (targets.length === 0) {
        return;
    }
    if (!(await confirmForeignStaged(targets, strings, language))) {
        return;
    }

    const message = await vscode.window.showInputBox({
        title: strings.git.commitPrompt,
        prompt: strings.git.commitPrompt,
        placeHolder: strings.git.commitPlaceholder,
        value: formatString(strings.git.commitDefault, toIsoDate(new Date()))
    });
    // Escape / dismissal is a deliberate "not now" and passes in silence.
    if (message === undefined) {
        return;
    }
    if (message.trim() === '') {
        notifyError(strings.git.commitEmptyMessage);
        return;
    }

    // Staging and committing run without visible feedback otherwise: on a
    // repository of any size `git add` alone takes long enough for the panel to
    // look like it ignored the click.
    const committed = await withGitProgress(strings.git.commitProgress, async () => {
        let done = 0;
        for (const target of targets) {
            try {
                await target.repository.add(target.changed);
                await target.repository.commit(message);
                done += target.changed.length;
            } catch (error) {
                const reason = formatError(error);
                logDiagnostic(`agenda git commit failed in ${target.repository.rootUri.fsPath}: ${reason}`);
                notifyError(formatString(strings.git.commitFailed, reason));
                return undefined;
            }
        }
        return done;
    });
    if (committed !== undefined) {
        notifyStatus(formatString(strings.git.committed, counted(committed, strings.git.files, language)));
    }
}

/**
 * Push every repository the view spans.
 *
 * A branch with no upstream cannot be pushed without deciding where to; that
 * decision is the user's, so it is asked as a modal naming the remote and
 * branch that would be created rather than guessed silently.
 *
 * Follows the same rules as the mobile client (`rust/markdown-org-ffi`): never
 * force, and a refusal is explained rather than forwarded. Nothing here passes
 * a force argument to `push`, and that omission is the safety property -- the
 * remote's refusal is the signal that the local branch is out of date, and the
 * answer to it is to get the missing commits, which happens outside this panel.
 */
export async function pushAgendaSources(
    files: readonly string[],
    strings: AgendaStrings,
    language: UiLanguage
): Promise<void> {
    const grouped = await groupByRepository(files, new Map());
    if (grouped.size === 0) {
        return;
    }
    const pushed = await withGitProgress(strings.git.pushProgress, async () => {
        // Counted in commits, like the button that starts this: a repository
        // count reports "1" for a branch ten commits ahead. Read before the
        // push, which is when the number is still true.
        let commits = 0;
        for (const repository of grouped.keys()) {
            const head = repository.state.HEAD;
            const ahead = head?.ahead ?? 0;
            try {
                if (head?.upstream) {
                    await repository.push();
                } else {
                    if (!(await confirmSetUpstream(repository, strings))) {
                        continue;
                    }
                    // `push(remote, branch, setUpstream)`: the third argument is
                    // what turns this into the equivalent of `push -u`. There is
                    // no fourth one here -- force stays off.
                    await repository.push('origin', head?.name, true);
                }
                commits += ahead;
            } catch (error) {
                reportPushFailure(error, repository, head?.name, head?.upstream, strings);
                return undefined;
            }
        }
        return commits;
    });
    if (pushed !== undefined && pushed > 0) {
        notifyStatus(formatString(strings.git.pushed, counted(pushed, strings.git.commits, language)));
    }
}

/**
 * Explain a failed push, and say what to do when the remote simply moved on.
 *
 * A non-fast-forward refusal is the one failure with a next step the user can
 * take, so it gets its own sentence naming both branches; git's own wording
 * ("Updates were rejected because the remote contains work that you do not
 * have locally") arrives buried in a multi-line stderr. Everything else is
 * reported as-is, because inventing an explanation for an unknown failure is
 * worse than quoting it.
 */
function reportPushFailure(
    error: unknown,
    repository: GitRepository,
    branch: string | undefined,
    upstream: { readonly remote: string; readonly name: string } | undefined,
    strings: AgendaStrings
): void {
    const reason = formatError(error);
    logDiagnostic(`agenda git push failed in ${repository.rootUri.fsPath}: ${reason}`);
    if (isPushRejected(error)) {
        const target = upstream ? `${upstream.remote}/${upstream.name}` : 'upstream';
        notifyError(formatString(strings.git.pushRejected, branch ?? 'HEAD', target));
        return;
    }
    notifyError(formatString(strings.git.pushFailed, reason));
}

/** Two signals for one refusal: the error code, then its text. */
function isPushRejected(error: unknown): boolean {
    const carrier = error as { gitErrorCode?: unknown; stderr?: unknown } | null | undefined;
    if (carrier?.gitErrorCode === PUSH_REJECTED_CODE) {
        return true;
    }
    const text = `${formatError(error)}\n${typeof carrier?.stderr === 'string' ? carrier.stderr : ''}`;
    return PUSH_REJECTED_TEXT.test(text);
}

/**
 * Run a git operation under a progress notification.
 *
 * `Notification` rather than `Window`: both actions can raise their own modal
 * (the commit message box, the upstream confirmation), and a status-bar spinner
 * behind a modal is not feedback anybody sees.
 */
function withGitProgress<T>(title: string, run: () => Promise<T>): Thenable<T> {
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title, cancellable: false },
        () => run()
    );
}

/** `3 files` / `3 файла`: the plural rule of the UI language, digits as typed. */
function counted(n: number, forms: readonly string[], language: UiLanguage): string {
    return `${n} ${forms[pluralIndex(n, language)] ?? ''}`.trim();
}

/** Is the repository mid-merge, with paths still unresolved? */
function hasConflicts(repository: GitRepository): boolean {
    return (repository.state.mergeChanges ?? []).length > 0;
}

/**
 * Keep the repositories with something of this view to commit, and count what
 * else each of them would carry.
 *
 * The narrowing is what the counters in the panel already say: a file the view
 * names but git reports as unchanged is not part of "commit 3 files", and a
 * repository left with none of them has nothing to be asked for.
 */
async function commitTargets(grouped: FilesByRepository, realPathCache: Map<string, string>): Promise<CommitTarget[]> {
    const targets: CommitTarget[] = [];
    for (const [repository, paths] of grouped) {
        const roots = await repositoryRoots(repository, realPathCache);
        const { changed, staged } = changeKeys(repository, roots);
        const ourKeys = new Set(paths.map((file) => pathKey(canonicalPath(file, roots))));
        const ours = paths.filter((file) => changed.has(pathKey(canonicalPath(file, roots))));
        if (ours.length === 0) {
            continue;
        }
        targets.push({
            repository,
            changed: ours,
            foreignStaged: [...staged].filter((key) => !ourKeys.has(key)).length
        });
    }
    return targets;
}

/**
 * Ask before a commit takes more than the view names.
 *
 * Asked once for the whole round rather than per repository: the answer is
 * about the commit the user is starting, and a modal per repository would turn
 * one decision into several. Silence on the common path -- an index holding
 * only what this panel staged raises nothing.
 */
async function confirmForeignStaged(
    targets: readonly CommitTarget[],
    strings: AgendaStrings,
    language: UiLanguage
): Promise<boolean> {
    const affected = targets.filter((target) => target.foreignStaged > 0);
    if (affected.length === 0) {
        return true;
    }
    const names = affected.map((target) => path.basename(target.repository.rootUri.fsPath)).join(', ');
    const total = affected.reduce((sum, target) => sum + target.foreignStaged, 0);
    const prompt = formatString(strings.git.commitForeignStaged, names, counted(total, strings.git.files, language));
    const choice = await vscode.window.showWarningMessage(prompt, { modal: true }, strings.git.commitForeignConfirm);
    return choice === strings.git.commitForeignConfirm;
}

/**
 * Ask before creating an upstream branch.
 *
 * Modal on purpose: this is the one step in the flow that writes something new
 * to a remote, and a toast that can be missed is not consent. `origin` is named
 * explicitly in the prompt so a repository whose only remote is called
 * something else is visibly the wrong case to accept.
 */
async function confirmSetUpstream(repository: GitRepository, strings: AgendaStrings): Promise<boolean> {
    const branch = repository.state.HEAD?.name;
    if (!branch) {
        // Detached HEAD: there is no branch to set an upstream for.
        notifyError(strings.git.pushDetachedHead);
        return false;
    }
    const prompt = formatString(strings.git.setUpstreamPrompt, branch, `origin/${branch}`);
    const choice = await vscode.window.showWarningMessage(prompt, { modal: true }, strings.git.setUpstreamConfirm);
    return choice === strings.git.setUpstreamConfirm;
}

/**
 * Resolve each file to its repository, keeping the real paths git needs.
 *
 * Files outside any repository are dropped rather than reported: the buttons
 * that lead here are only rendered when the counters they carry are non-zero,
 * and those counters already exclude such files.
 */
async function groupByRepository(
    files: readonly string[],
    realPathCache: Map<string, string>
): Promise<FilesByRepository> {
    const api = await getGitApi();
    const grouped: FilesByRepository = new Map();
    if (!api) {
        return grouped;
    }
    for (const file of files) {
        const resolved = await resolveRepositoryFor(api, file, realPathCache);
        if (!resolved) {
            continue;
        }
        const paths = grouped.get(resolved.repository) ?? [];
        // Taken as returned: `resolveRepositoryFor` has already chosen which of
        // the two spellings git will accept, and resolving it again would undo
        // that choice for a committed symlink pointing out of its repository --
        // there the link is the tracked path and its target is not.
        paths.push(resolved.realPath);
        grouped.set(resolved.repository, paths);
    }
    return grouped;
}
