/**
 * Turn the source files of the current agenda view into the status model the
 * header renders.
 *
 * This is the only place that reads the Git extension's live state. It resolves
 * each unique source file to its repository (gitApi.ts), then asks every
 * repository involved two questions: which of its paths are uncommitted, and
 * which were touched by commits upstream does not have.
 *
 * Path canonicalisation deserves the attention it gets below. A repository can
 * be open under a symlinked path while the agenda file resolves to the real one
 * (or the reverse), and then the change lists and the file list are written in
 * two different alphabets. Rather than `realpath` every changed path -- a large
 * repository reports hundreds -- both sides are rewritten relative to the
 * repository root and re-anchored on the root's real path. That costs one
 * `realpath` per repository and makes the two spellings converge.
 */
import * as path from 'node:path';
import type { AgendaGitStatus } from '../../types';
import { formatError } from '../formatError';
import { logDiagnostic } from '../logChannel';
import { getGitApi, resolveRealPath, resolveRepositoryFor } from './gitApi';
import type { GitApi, GitRepository } from './gitApiTypes';
import { isInside, pathKey } from './gitPathMatch';
import { buildGitStatus } from './gitStatusModel';
import type { GitRepoSnapshot, GitSourceFile } from './gitStatusModel';

/** A repository plus the canonical form of the paths it reports. */
interface RepositoryContext {
    repository: GitRepository;
    root: string;
    rootReal: string;
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
            realPath: canonicalPath(resolved.realPath, context),
            repoRoot: context.rootReal
        });
    }

    const snapshots = await Promise.all([...contexts.values()].map((context) => snapshotRepository(context)));
    return buildGitStatus(sources, snapshots);
}

/** Repositories currently known to the Git extension; used to wire listeners. */
export async function gitRepositories(): Promise<readonly GitRepository[]> {
    const api = await getGitApi();
    return api ? api.repositories : [];
}

/** The API handle, for callers that need to subscribe to repository events. */
export async function gitApiForEvents(): Promise<GitApi | null> {
    return getGitApi();
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
    const root = repository.rootUri.fsPath;
    const key = pathKey(root);
    const existing = contexts.get(key);
    if (existing) {
        return existing;
    }
    const context: RepositoryContext = {
        repository,
        root,
        rootReal: await resolveRealPath(root, realPathCache)
    };
    contexts.set(key, context);
    return context;
}

/**
 * Rewrite a path so every path of one repository is expressed against the same
 * root. Paths already under the real root are left alone; paths under the root
 * as opened are re-anchored; anything outside both is returned unchanged and
 * simply will not match.
 */
function canonicalPath(value: string, context: RepositoryContext): string {
    if (isInside(context.rootReal, value)) {
        return value;
    }
    if (isInside(context.root, value)) {
        return path.join(context.rootReal, path.relative(context.root, value));
    }
    return value;
}

async function snapshotRepository(context: RepositoryContext): Promise<GitRepoSnapshot> {
    const state = context.repository.state;
    const head = state.HEAD;
    const upstream = head?.upstream ? `${head.upstream.remote}/${head.upstream.name}` : undefined;

    const uncommitted = [...state.workingTreeChanges, ...state.indexChanges, ...(state.untrackedChanges ?? [])].map(
        (change) => canonicalPath(change.uri.fsPath, context)
    );

    return {
        root: context.rootReal,
        ...(head?.name === undefined ? {} : { branch: head.name }),
        ...(upstream === undefined ? {} : { upstream }),
        ...(head?.ahead === undefined ? {} : { aheadCommits: head.ahead }),
        uncommitted,
        unpushed: await unpushedPaths(context, upstream, head?.ahead)
    };
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
        return changes.map((change) => canonicalPath(change.uri.fsPath, context));
    } catch (error) {
        // A missing upstream ref or a fresh repository with no commits lands
        // here. The uncommitted half of the status is still valid, so the view
        // degrades to it rather than disappearing.
        logDiagnostic(
            `agenda git status: cannot diff ${upstream}...HEAD in ${context.rootReal}: ${formatError(error)}`
        );
        return [];
    }
}
