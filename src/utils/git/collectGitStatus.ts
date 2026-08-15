/**
 * Turn the source files of the current agenda view into the status model the
 * header renders.
 *
 * This is the only place that reads the Git extension's live state. It resolves
 * each unique source file to its repository (gitApi.ts), then asks every
 * repository involved four things: which of its paths are uncommitted, which
 * were touched by commits upstream does not have, which a merge left
 * unresolved, and -- through `repository.log` -- what those unpushed commits
 * are, so the panel can list them above the files they touched.
 *
 * Path canonicalisation -- the rule that makes a symlinked root and a real one
 * meet in one alphabet -- lives in `repositoryPaths.ts`, because the commit
 * action narrows its file list by the same rule.
 */
import type { AgendaGitStatus, GitCommitState } from '../../types';
import { formatError } from '../formatError';
import { logDiagnostic } from '../logChannel';
import { getGitApi, resolveRealPath, resolveRepositoryFor } from './gitApi';
import type { GitRepository } from './gitApiTypes';
import { pathKey } from './gitPathMatch';
import { canonicalPath, repositoryRoots } from './repositoryPaths';
import type { RepositoryRoots } from './repositoryPaths';
import { commitSubject } from './commitSubject';
import { upstreamRef } from './upstreamRef';
import { buildGitStatus } from './gitStatusModel';
import type { GitRepoSnapshot, GitSourceFile } from './gitStatusModel';

/**
 * How many unpushed commits the panel lists before summarising the rest.
 *
 * Eight fills the dropdown without turning it into a log viewer, and a branch
 * that far ahead is better read in the Source Control view anyway. The count
 * the header states stays the true one, so the list never quietly under-reports.
 */
const MAX_UNPUSHED_COMMITS = 8;

/** How much of a hash the panel prints -- git's own default abbreviation. */
const SHORT_HASH_LENGTH = 7;

/** A repository plus the canonical form of the paths it reports. */
interface RepositoryContext {
    repository: GitRepository;
    roots: RepositoryRoots;
}

/**
 * Build the status for `files`, or `undefined` when there is no git to ask.
 *
 * Never throws: a failure anywhere degrades to a smaller answer (no unpushed
 * counts, a file in the "outside git" group) with a line in the diagnostic log,
 * because the agenda renders with or without this.
 */
export async function collectGitStatus(files: readonly string[]): Promise<AgendaGitStatus | undefined> {
    const api = await getGitApi();
    if (!api) {
        return undefined;
    }
    const realPathCache = new Map<string, string>();
    const contexts = new Map<string, RepositoryContext>();
    const sources: GitSourceFile[] = [];

    for (const file of uniquePaths(files)) {
        const resolved = await resolveRepositoryFor(api, file, realPathCache);
        if (!resolved) {
            sources.push({ file, realPath: await resolveRealPath(file, realPathCache) });
            continue;
        }
        const context = await repositoryContext(resolved.repository, contexts, realPathCache);
        sources.push({
            file,
            realPath: canonicalPath(resolved.realPath, context.roots),
            repoRoot: context.roots.rootReal
        });
    }

    const snapshots = await Promise.all([...contexts.values()].map((context) => snapshotRepository(context)));
    return buildGitStatus(sources, snapshots);
}

/** Preserve the order of first appearance; the page lists files in view order. */
function uniquePaths(files: readonly string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const file of files) {
        const key = pathKey(file);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(file);
    }
    return unique;
}

async function repositoryContext(
    repository: GitRepository,
    contexts: Map<string, RepositoryContext>,
    realPathCache: Map<string, string>
): Promise<RepositoryContext> {
    const key = pathKey(repository.rootUri.fsPath);
    const existing = contexts.get(key);
    if (existing) {
        return existing;
    }
    const context: RepositoryContext = {
        repository,
        roots: await repositoryRoots(repository, realPathCache)
    };
    contexts.set(key, context);
    return context;
}

async function snapshotRepository(context: RepositoryContext): Promise<GitRepoSnapshot> {
    const state = context.repository.state;
    const head = state.HEAD;
    // A ref git would read as an option is dropped here rather than passed on:
    // both the log and the diff below hand it to git as a bare argument
    // (see upstreamRef.ts). The rest of the status is unaffected.
    const upstream = upstreamRef(head?.upstream);
    if (head?.upstream && upstream === undefined) {
        logDiagnostic(
            `agenda git status: ignoring the upstream of ${context.roots.rootReal} -- ` +
                `"${head.upstream.remote}/${head.upstream.name}" would be read by git as an option`
        );
    }

    const uncommitted = [...state.workingTreeChanges, ...state.indexChanges, ...(state.untrackedChanges ?? [])].map(
        (change) => canonicalPath(change.uri.fsPath, context.roots)
    );

    return {
        root: context.roots.rootReal,
        ...(head?.name === undefined ? {} : { branch: head.name }),
        ...(upstream === undefined ? {} : { upstream }),
        ...(head?.ahead === undefined ? {} : { aheadCommits: head.ahead }),
        uncommitted,
        // Conflicts sit in their own bucket rather than in `workingTreeChanges`,
        // so a file the user is still resolving would otherwise pass for clean.
        conflicts: (state.mergeChanges ?? []).map((change) => canonicalPath(change.uri.fsPath, context.roots)),
        unpushed: await unpushedPaths(context, upstream, head?.ahead),
        commits: await unpushedCommits(context, upstream, head?.ahead)
    };
}

/**
 * The commits Push would send, newest first.
 *
 * Two dots, not the three of `diffBetween`: `upstream..HEAD` is exactly "mine
 * that the remote has not got", while `upstream...HEAD` would answer with a
 * diff and say nothing about which commits produced it.
 *
 * `maxEntries` is passed but does not bound the answer -- the shipped
 * extension appends either the range or `-n`, never both -- so the list is cut
 * here. The whole count still reaches the page as `aheadCommits`, which is
 * what the "and N more" line is computed from.
 *
 * The argument is kept deliberately: it is what the API asks for, it costs
 * nothing, and a host that learns to combine the range with `-n` would then
 * stop reading the whole log. The `slice` stays either way -- it is the part
 * that is guaranteed.
 */
async function unpushedCommits(
    context: RepositoryContext,
    upstream: string | undefined,
    ahead: number | undefined
): Promise<GitCommitState[]> {
    if (upstream === undefined || ahead === 0) {
        return [];
    }
    try {
        const commits = await context.repository.log({
            range: `${upstream}..HEAD`,
            maxEntries: MAX_UNPUSHED_COMMITS
        });
        return commits.slice(0, MAX_UNPUSHED_COMMITS).map((commit) => ({
            hash: commit.hash.slice(0, SHORT_HASH_LENGTH),
            subject: commitSubject(commit.message)
        }));
    } catch (error) {
        // Same degradation as the diff above: the counts survive, only the
        // list of commits is missing.
        logDiagnostic(
            `agenda git status: cannot log ${upstream}..HEAD in ${context.roots.rootReal}: ${formatError(error)}`
        );
        return [];
    }
}

/**
 * Paths changed by commits the upstream does not have.
 *
 * `diffBetween(upstream, 'HEAD')` diffs `upstream...HEAD` -- from the merge
 * base -- so commits that arrived on the remote side do not leak into the
 * answer. Skipped outright when there is no upstream or the branch is level
 * with it, which is both the common case and the one where the call would only
 * spawn a git process to return nothing.
 */
async function unpushedPaths(
    context: RepositoryContext,
    upstream: string | undefined,
    ahead: number | undefined
): Promise<string[]> {
    if (upstream === undefined || ahead === 0) {
        return [];
    }
    try {
        const changes = await context.repository.diffBetween(upstream, 'HEAD');
        return changes.map((change) => canonicalPath(change.uri.fsPath, context.roots));
    } catch (error) {
        // A missing upstream ref or a fresh repository with no commits lands
        // here. The uncommitted half of the status is still valid, so the view
        // degrades to it rather than disappearing.
        logDiagnostic(
            `agenda git status: cannot diff ${upstream}...HEAD in ${context.roots.rootReal}: ${formatError(error)}`
        );
        return [];
    }
}
