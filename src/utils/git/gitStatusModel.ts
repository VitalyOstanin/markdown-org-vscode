/**
 * The git-status model the agenda header renders, and the pure function that
 * builds it.
 *
 * Everything that touches VS Code or the file system happens in
 * `collectGitStatus.ts`; this module takes the result as plain data so the
 * counting rules -- which are the part that can be quietly wrong -- are unit
 * testable without a host.
 *
 * The two counters answer different questions and are deliberately both in
 * files: "how many of the files I am looking at are not saved to git" and "how
 * many of them are saved but not sent". The commit count is carried alongside
 * for the wording in the expanded list, not for the header chip.
 */
// The three result types are payload contracts with the page, so they live
// in src/types.ts alongside `Task` -- the webview project cannot import a
// module that reaches for `node:path`, which this one does through
// `gitPathMatch`.
import type { AgendaGitStatus, GitFileState, GitRepoState } from '../../types';
import { pathApi, pathKey } from './gitPathMatch';

/** One repository, reduced to what the model needs. */
export interface GitRepoSnapshot {
    /** Repository root as the Git extension reports it. */
    root: string;
    /** Branch name, absent on a detached HEAD. */
    branch?: string;
    /** `origin/master`; absent when the branch has no upstream. */
    upstream?: string;
    /** Commits on the branch that upstream does not have. */
    aheadCommits?: number;
    /** Real paths with uncommitted changes (working tree, index, untracked). */
    uncommitted: readonly string[];
    /** Real paths touched by commits absent from upstream. */
    unpushed: readonly string[];
}

/** One agenda source file, already resolved against the repositories. */
export interface GitSourceFile {
    /** Path exactly as the extractor reported it -- what the user recognises. */
    file: string;
    /** Path after `realpath`; equal to `file` when it is not a symlink. */
    realPath: string;
    /** Root of the repository holding it, absent when it is outside git. */
    repoRoot?: string;
}

/**
 * Combine the per-repository snapshots with the files of the current agenda
 * view.
 *
 * Files are de-duplicated by their original path: a day view routinely repeats
 * the same source file across a dozen tasks, and the counters are about files,
 * not tasks. Repositories that hold none of the view's files are dropped, so
 * `unpushedCommits` never counts a repository the user is not looking at.
 */
export function buildGitStatus(
    sources: readonly GitSourceFile[],
    repos: readonly GitRepoSnapshot[],
    platform: NodeJS.Platform = process.platform
): AgendaGitStatus {
    const byRoot = new Map<string, GitRepoSnapshot>();
    const uncommittedSets = new Map<string, Set<string>>();
    const unpushedSets = new Map<string, Set<string>>();
    for (const repo of repos) {
        const key = pathKey(repo.root, platform);
        byRoot.set(key, repo);
        uncommittedSets.set(key, new Set(repo.uncommitted.map((p) => pathKey(p, platform))));
        unpushedSets.set(key, new Set(repo.unpushed.map((p) => pathKey(p, platform))));
    }

    const seen = new Set<string>();
    const files: GitFileState[] = [];
    const usedRoots = new Set<string>();
    for (const source of sources) {
        const dedupeKey = pathKey(source.file, platform);
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);

        const rootKey = source.repoRoot === undefined ? undefined : pathKey(source.repoRoot, platform);
        const realKey = pathKey(source.realPath, platform);
        const uncommitted = rootKey !== undefined && (uncommittedSets.get(rootKey)?.has(realKey) ?? false);
        const unpushed = rootKey !== undefined && (unpushedSets.get(rootKey)?.has(realKey) ?? false);
        if (rootKey !== undefined) {
            usedRoots.add(rootKey);
        }

        files.push({
            file: source.file,
            ...(source.realPath === source.file ? {} : { realPath: source.realPath }),
            label: fileLabel(source, platform),
            ...(source.repoRoot === undefined ? {} : { repoRoot: source.repoRoot }),
            uncommitted,
            unpushed
        });
    }

    const activeRepos = [...usedRoots]
        .map((key) => byRoot.get(key))
        .filter((repo): repo is GitRepoSnapshot => repo !== undefined)
        .map((repo): GitRepoState => ({
            root: repo.root,
            name: pathApi(platform).basename(repo.root),
            ...(repo.branch === undefined ? {} : { branch: repo.branch }),
            ...(repo.upstream === undefined ? {} : { upstream: repo.upstream }),
            ...(repo.aheadCommits === undefined ? {} : { aheadCommits: repo.aheadCommits })
        }))
        .sort((a, b) => a.root.localeCompare(b.root));

    return {
        repos: activeRepos,
        files,
        uncommittedCount: files.filter((f) => f.uncommitted).length,
        unpushedCount: files.filter((f) => f.unpushed).length,
        outsideGitCount: files.filter((f) => f.repoRoot === undefined).length,
        unpushedCommits: activeRepos.reduce((sum, repo) => sum + (repo.aheadCommits ?? 0), 0)
    };
}

/**
 * What the expanded list shows for a file: its path inside the repository, so
 * two files with the same name in different folders stay distinguishable.
 *
 * The label is derived from the real path, because that is the one that sits
 * under the repository root -- relating the symlink path to that root would
 * produce a `../../..` chain. The path the user typed still reaches the page as
 * `file` and remains what the row opens.
 */
function fileLabel(source: GitSourceFile, platform: NodeJS.Platform): string {
    const api = pathApi(platform);
    if (source.repoRoot === undefined) {
        return api.basename(source.file);
    }
    const relative = api.relative(source.repoRoot, source.realPath);
    // A file that is not under the root (which `resolveRepositoryFor` can
    // produce for a committed symlink pointing outside) would render as a
    // `../` chain; its bare name reads better and the tooltip carries the rest.
    return relative && !relative.startsWith('..') ? relative : api.basename(source.file);
}
