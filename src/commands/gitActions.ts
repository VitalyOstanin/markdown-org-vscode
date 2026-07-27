/**
 * Commit and push the agenda's source files, from the panel's git dropdown.
 *
 * Scope is the point of these two: the commit stages exactly the changed files
 * the current view is built from, so an unrelated edit elsewhere in the same
 * repository is not swept into a commit the user thinks is about their notes.
 * That is why `repo.add()` is given an explicit path list rather than the
 * commit being run with `all: true`.
 *
 * Paths handed to git are the resolved ones: `git add` runs with the repository
 * root as its working directory and will not accept a symlink path from outside
 * that root (see ADR-0016).
 */
import * as vscode from 'vscode';
import { getGitApi, resolveRealPath, resolveRepositoryFor } from '../utils/git/gitApi';
import type { GitRepository } from '../utils/git/gitApiTypes';
import { formatError, notifyError, notifyStatus } from '../utils/notify';
import { logDiagnostic } from '../utils/logChannel';
import { formatString } from '../utils/agendaI18n';
import type { AgendaStrings } from '../utils/agendaI18n';
import { toIsoDate } from '../utils/isoDate';

/** Files grouped by the repository that will commit them. */
type FilesByRepository = Map<GitRepository, string[]>;

/**
 * Stage the given source files and commit them under one message.
 *
 * The message is asked for once and reused across repositories: the files came
 * from a single agenda view, and making the user retype the same sentence per
 * repository would be the wrong kind of precision.
 */
export async function commitAgendaSources(files: readonly string[], strings: AgendaStrings): Promise<void> {
    const grouped = await groupByRepository(files);
    if (grouped.size === 0) {
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

    let committed = 0;
    for (const [repository, paths] of grouped) {
        try {
            await repository.add(paths);
            await repository.commit(message);
            committed += paths.length;
        } catch (error) {
            const reason = formatError(error);
            logDiagnostic(`agenda git commit failed in ${repository.rootUri.fsPath}: ${reason}`);
            notifyError(`git commit failed: ${reason}`);
            return;
        }
    }
    notifyStatus(formatString(strings.git.committed, String(committed)));
}

/**
 * Push every repository the view spans.
 *
 * A branch with no upstream cannot be pushed without deciding where to; that
 * decision is the user's, so it is asked as a modal naming the remote and
 * branch that would be created rather than guessed silently.
 */
export async function pushAgendaSources(files: readonly string[], strings: AgendaStrings): Promise<void> {
    const grouped = await groupByRepository(files);
    let pushed = 0;
    for (const repository of grouped.keys()) {
        const head = repository.state.HEAD;
        try {
            if (head?.upstream) {
                await repository.push();
            } else {
                if (!(await confirmSetUpstream(repository, strings))) {
                    continue;
                }
                // `push(remote, branch, setUpstream)`: the third argument is
                // what turns this into the equivalent of `push -u`.
                await repository.push('origin', head?.name, true);
            }
            pushed += 1;
        } catch (error) {
            const reason = formatError(error);
            logDiagnostic(`agenda git push failed in ${repository.rootUri.fsPath}: ${reason}`);
            notifyError(`git push failed: ${reason}`);
            return;
        }
    }
    if (pushed > 0) {
        notifyStatus(formatString(strings.git.pushed, String(pushed)));
    }
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
        notifyError('git push: HEAD is not on a branch');
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
async function groupByRepository(files: readonly string[]): Promise<FilesByRepository> {
    const api = await getGitApi();
    const grouped: FilesByRepository = new Map();
    if (!api) {
        return grouped;
    }
    const realPathCache = new Map<string, string>();
    for (const file of files) {
        const resolved = await resolveRepositoryFor(api, file, realPathCache);
        if (!resolved) {
            continue;
        }
        const paths = grouped.get(resolved.repository) ?? [];
        // `resolveRepositoryFor` already returns the path git will accept, but
        // the cache is shared so the lookup costs nothing here.
        paths.push(await resolveRealPath(resolved.realPath, realPathCache));
        grouped.set(resolved.repository, paths);
    }
    return grouped;
}
