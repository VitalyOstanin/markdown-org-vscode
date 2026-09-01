/**
 * Commit, push and sync the agenda's source files, from the panel's git dropdown.
 *
 * Scope is the point of the first two: the commit stages exactly the changed files
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
import type { GitBranch, GitRepository } from '../utils/git/gitApiTypes';
import { pathKey } from '../utils/git/gitPathMatch';
import { isPushRejected } from '../utils/git/pushRejection';
import { canonicalPath, changeKeys, repositoryRoots } from '../utils/git/repositoryPaths';
import { formatError, notifyError, notifyStatus } from '../utils/notify';
import { logDiagnostic } from '../utils/logChannel';
import { formatString } from '../utils/agendaI18n';
import { countedNoun } from '../utils/countedNoun';
import { currentDateLocale } from '../utils/hostLocale';
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
 * How a commit round ended, for a caller with something to do afterwards.
 *
 * The distinction that matters is between "the user said no" and "there was
 * nothing to write": a round that found every file already committed has not
 * failed, and the sync that follows it is still worth running.
 */
export type CommitOutcome = 'committed' | 'nothing-to-commit' | 'cancelled' | 'failed';

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
): Promise<CommitOutcome> {
    const realPathCache = new Map<string, string>();
    const grouped = await groupByRepository(files, realPathCache);
    if (grouped.size === 0) {
        return 'nothing-to-commit';
    }

    // Checked before the message is asked for: typing a commit message only to
    // be told it cannot be used is the wrong order of a refusal. The panel
    // normally hides the button already, but its status is a snapshot and the
    // merge may have started since.
    const conflicted = [...grouped.keys()].find((repository) => hasConflicts(repository));
    if (conflicted) {
        notifyError(formatString(strings.git.commitConflicts, path.basename(conflicted.rootUri.fsPath)));
        return 'failed';
    }

    // A repository whose files are all committed already is left out entirely:
    // `commit` refuses an empty index, and that refusal used to abort the whole
    // round, leaving the repositories after it uncommitted.
    const targets = await commitTargets(grouped, realPathCache);
    if (targets.length === 0) {
        return 'nothing-to-commit';
    }
    if (!(await confirmForeignStaged(targets, strings, language))) {
        return 'cancelled';
    }

    const message = await vscode.window.showInputBox({
        title: strings.git.commitPrompt,
        prompt: strings.git.commitPrompt,
        placeHolder: strings.git.commitPlaceholder,
        value: formatString(strings.git.commitDefault, toIsoDate(new Date()))
    });
    // Escape / dismissal is a deliberate "not now" and passes in silence.
    if (message === undefined) {
        return 'cancelled';
    }
    if (message.trim() === '') {
        notifyError(strings.git.commitEmptyMessage);
        return 'failed';
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
    if (committed === undefined) {
        return 'failed';
    }
    notifyStatus(
        formatString(strings.git.committed, countedNoun(committed, strings.git.files, language, currentDateLocale()))
    );
    return 'committed';
}

/**
 * One press for what used to be two: commit, then sync.
 *
 * A note written here is read on the phone, and that takes both halves -- the
 * commit alone leaves the note on this machine. Pressing them separately meant
 * the second was easy to forget, and the notes then sat committed and unsent
 * until the next time the panel was opened.
 *
 * The sync is skipped when the commit did not happen by the user's choice or by
 * a failure: an escaped message box is a "not now" about the whole press, and a
 * commit that failed is news to read rather than something to build on. A round
 * that found nothing to commit still syncs -- the counters the button was drawn
 * from are a snapshot, and what the remote holds is the other half of the
 * question anyway.
 */
export async function commitAndSyncAgendaSources(
    files: readonly string[],
    strings: AgendaStrings,
    language: UiLanguage
): Promise<void> {
    const outcome = await commitAgendaSources(files, strings, language);
    if (outcome === 'cancelled' || outcome === 'failed') {
        return;
    }
    await syncAgendaSources(files, strings, language);
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
    const result = await withGitProgress(strings.git.pushProgress, async () => {
        // Counted in commits, like the button that starts this: a repository
        // count reports "1" for a branch ten commits ahead. Read before the
        // push, which is when the number is still true.
        let commits = 0;
        const upstreams: string[] = [];
        for (const repository of grouped.keys()) {
            const head = repository.state.HEAD;
            try {
                if (head?.upstream) {
                    // Level with its upstream: pushing it would be a network
                    // round trip for nothing, and the button that started this
                    // did not count it either.
                    const ahead = head.ahead ?? 0;
                    if (ahead === 0) {
                        continue;
                    }
                    await repository.push();
                    commits += ahead;
                } else {
                    if (!(await confirmSetUpstream(repository, strings))) {
                        continue;
                    }
                    // `push(remote, branch, setUpstream)`: the third argument is
                    // what turns this into the equivalent of `push -u`. There is
                    // no fourth one here -- force stays off.
                    await repository.push('origin', head?.name, true);
                    // Not counted in commits: `ahead` is absent for a branch
                    // with no upstream (there is nothing to count against), so
                    // this outcome is reported by name instead of by number.
                    upstreams.push(repositoryBranch(repository, head?.name));
                }
            } catch (error) {
                reportPushFailure(error, repository, head?.name, head?.upstream, strings);
                return undefined;
            }
        }
        return { commits, upstreams };
    });
    if (!result) {
        return;
    }
    // A created upstream outranks the count: it is the rarer outcome and the
    // one the user just consented to, so it is what the confirmation names.
    // The commits of the same round are still in the log line above.
    if (result.upstreams.length > 0) {
        notifyStatus(formatString(strings.git.pushedUpstream, result.upstreams.join(strings.git.titleSeparator)));
    } else if (result.commits > 0) {
        notifyStatus(
            formatString(
                strings.git.pushed,
                countedNoun(result.commits, strings.git.commits, language, currentDateLocale())
            )
        );
    }
}

/** What one repository's sync did, in the two directions a run can move. */
interface SyncOutcome {
    /** Commits the fetch brought in and the fast-forward then applied. */
    took: number;
    /** Commits handed to the remote. */
    handed: number;
    /** Branch and upstream of a repository whose two sides have both moved. */
    diverged?: readonly [string, string];
    /** `repository/branch` of a branch whose upstream this run created. */
    upstream?: string;
}

/**
 * Both directions in one press: take what the remote has, then hand over what
 * it does not.
 *
 * This is the mobile client's sync (`rust/markdown-org-ffi/src/sync.rs`) with
 * the same refusals, because the two clients share the repositories and a rule
 * one of them keeps alone is not a rule. A branch that is only behind is moved
 * onto its upstream; one that is only ahead is pushed; one that is both is left
 * exactly as it is and reported, since merging is a decision with an author and
 * this panel is not it.
 *
 * The fast-forward is a property of the order, not of a flag: `pull` is called
 * only where `ahead` is zero, so the branch has nothing of its own for a merge
 * to be made of. Nothing here passes a force argument to `push` either.
 */
export async function syncAgendaSources(
    files: readonly string[],
    strings: AgendaStrings,
    language: UiLanguage
): Promise<void> {
    const grouped = await groupByRepository(files, new Map());
    if (grouped.size === 0) {
        return;
    }
    const outcomes = await withGitProgress(strings.git.syncProgress, async () => {
        const done: SyncOutcome[] = [];
        for (const repository of grouped.keys()) {
            const outcome = await syncRepository(repository, strings);
            // A failure stops the round: the repositories after this one are
            // the same notes, and reporting a sync that half happened under a
            // single confirmation would be a worse account than none.
            if (!outcome) {
                return undefined;
            }
            done.push(outcome);
        }
        return done;
    });
    if (outcomes) {
        reportSync(outcomes, strings, language);
    }
}

/** Fetch, then move whichever side has something to move. */
async function syncRepository(repository: GitRepository, strings: AgendaStrings): Promise<SyncOutcome | undefined> {
    const nothing: SyncOutcome = { took: 0, handed: 0 };
    const head = repository.state.HEAD;
    try {
        if (!head?.upstream) {
            return await publishBranch(repository, head?.name, strings);
        }
        await repository.fetch();
        // The counts live on `state`, and a fetch only moves the remote ref:
        // without this the branch is read as it stood before the fetch, and a
        // repository that just fell behind is reported as level.
        await repository.status();
        const fetched = repository.state.HEAD;
        const behind = fetched?.behind ?? 0;
        const ahead = fetched?.ahead ?? 0;
        if (behind > 0 && ahead > 0) {
            const upstream = `${head.upstream.remote}/${head.upstream.name}`;
            return { ...nothing, diverged: [fetched?.name ?? 'HEAD', upstream] };
        }
        if (behind > 0) {
            await repository.pull();
            return { ...nothing, took: behind };
        }
        if (ahead > 0) {
            await repository.push();
            return { ...nothing, handed: ahead };
        }
        return nothing;
    } catch (error) {
        reportSyncFailure(error, repository, head, strings);
        return undefined;
    }
}

/**
 * A branch with no upstream: there is nothing to fetch against, so the run is
 * the push half alone, asked for the same way the push button asks.
 */
async function publishBranch(
    repository: GitRepository,
    branch: string | undefined,
    strings: AgendaStrings
): Promise<SyncOutcome> {
    if (!(await confirmSetUpstream(repository, strings))) {
        return { took: 0, handed: 0 };
    }
    await repository.push('origin', branch, true);
    return { took: 0, handed: 0, upstream: repositoryBranch(repository, branch) };
}

/**
 * Say what stopped the sync.
 *
 * A refusal from the remote keeps the push button's wording: it is the same
 * event with the same next step, and the sync reaching it means the remote
 * moved between the fetch a moment ago and the push. Everything else is quoted,
 * because a fetch and a fast-forward fail for reasons this code cannot name.
 */
function reportSyncFailure(
    error: unknown,
    repository: GitRepository,
    head: GitBranch | undefined,
    strings: AgendaStrings
): void {
    if (isPushRejected(error)) {
        reportPushFailure(error, repository, head?.name, head?.upstream, strings);
        return;
    }
    const reason = formatError(error);
    logDiagnostic(`agenda git sync failed in ${repository.rootUri.fsPath}: ${reason}`);
    notifyError(formatString(strings.git.syncFailed, reason));
}

/**
 * Report the round: what came in, what went out, what was left alone.
 *
 * A divergence is an error and the rest is a status line, and both are shown:
 * the repository that could not move is the news, but a run that also brought
 * commits into the other repositories has to say so, or the panel's counters
 * change under an announcement that nothing happened.
 */
function reportSync(outcomes: readonly SyncOutcome[], strings: AgendaStrings, language: UiLanguage): void {
    const locale = currentDateLocale();
    const diverged = outcomes.find((outcome) => outcome.diverged)?.diverged;
    if (diverged) {
        notifyError(formatString(strings.git.syncDiverged, diverged[0], diverged[1]));
    }
    const total = (of: (outcome: SyncOutcome) => number): number => outcomes.reduce((sum, o) => sum + of(o), 0);
    const took = total((outcome) => outcome.took);
    const handed = total((outcome) => outcome.handed);
    const upstreams = outcomes.map((outcome) => outcome.upstream).filter((name) => name !== undefined);
    const said: string[] = [];
    if (took > 0) {
        said.push(formatString(strings.git.syncTook, countedNoun(took, strings.git.commits, language, locale)));
    }
    if (handed > 0) {
        said.push(formatString(strings.git.pushed, countedNoun(handed, strings.git.commits, language, locale)));
    }
    if (upstreams.length > 0) {
        said.push(formatString(strings.git.pushedUpstream, upstreams.join(strings.git.titleSeparator)));
    }
    if (said.length > 0) {
        notifyStatus(said.join(strings.git.titleSeparator));
    } else if (!diverged) {
        notifyStatus(strings.git.syncLevel);
    }
}

/** `notes/master`: the repository directory and the branch inside it. */
function repositoryBranch(repository: GitRepository, branch: string | undefined): string {
    return `${path.basename(repository.rootUri.fsPath)}/${branch ?? 'HEAD'}`;
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
    const prompt = formatString(
        strings.git.commitForeignStaged,
        names,
        countedNoun(total, strings.git.files, language, currentDateLocale())
    );
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
 *
 * The repository is named too: a view can span several of them, the branches
 * are routinely called the same in all, and a repository with no upstream is
 * absent from the counter on the button that raised this -- so without its name
 * the question is about a repository the panel never mentioned.
 */
async function confirmSetUpstream(repository: GitRepository, strings: AgendaStrings): Promise<boolean> {
    const branch = repository.state.HEAD?.name;
    if (!branch) {
        // Detached HEAD: there is no branch to set an upstream for.
        notifyError(strings.git.pushDetachedHead);
        return false;
    }
    const prompt = formatString(
        strings.git.setUpstreamPrompt,
        path.basename(repository.rootUri.fsPath),
        branch,
        `origin/${branch}`
    );
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
