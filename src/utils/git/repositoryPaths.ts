/**
 * One repository seen under both spellings of its root, and the changed paths
 * it reports, expressed in a single alphabet.
 *
 * A repository can be open under a symlinked path while an agenda file resolves
 * to the real one (or the reverse), and then the change lists and the file list
 * are written differently for the same file. Rather than `realpath` every
 * changed path -- a large repository reports hundreds -- both sides are
 * rewritten relative to the root and re-anchored on the root's real path. That
 * costs one `realpath` per repository.
 *
 * Shared by the status collector, which counts these paths, and by the commit
 * action, which narrows the files it stages to them.
 */
import * as path from 'node:path';
import { resolveRealPath } from './gitApi';
import type { GitRepository } from './gitApiTypes';
import { isInside, pathKey } from './gitPathMatch';

/** A repository root as it was opened, and as the file system spells it. */
export interface RepositoryRoots {
    /** Root as the Git extension reports it, symlinks and all. */
    root: string;
    /** The same root after `realpath` -- the alphabet everything is rewritten to. */
    rootReal: string;
}

/** Resolve both spellings of a repository root, reusing the caller's cache. */
export async function repositoryRoots(
    repository: GitRepository,
    realPathCache: Map<string, string>
): Promise<RepositoryRoots> {
    const root = repository.rootUri.fsPath;
    return { root, rootReal: await resolveRealPath(root, realPathCache) };
}

/**
 * Rewrite a path so every path of one repository is expressed against the same
 * root. Paths already under the real root are left alone; paths under the root
 * as opened are re-anchored; anything outside both is returned unchanged and
 * simply will not match.
 */
export function canonicalPath(value: string, roots: RepositoryRoots): string {
    if (isInside(roots.rootReal, value)) {
        return value;
    }
    if (isInside(roots.root, value)) {
        return path.join(roots.rootReal, path.relative(roots.root, value));
    }
    return value;
}

/** The change buckets a commit cares about, as canonical path keys. */
export interface RepositoryChangeKeys {
    /** Anything a commit could carry: working tree, index, untracked. */
    changed: Set<string>;
    /** The index alone -- what a commit carries whether it was asked to or not. */
    staged: Set<string>;
}

/** Read the repository's change lists into keys comparable with agenda paths. */
export function changeKeys(repository: GitRepository, roots: RepositoryRoots): RepositoryChangeKeys {
    const state = repository.state;
    const key = (fsPath: string): string => pathKey(canonicalPath(fsPath, roots));
    const staged = new Set(state.indexChanges.map((change) => key(change.uri.fsPath)));
    const changed = new Set([
        ...state.workingTreeChanges.map((change) => key(change.uri.fsPath)),
        ...(state.untrackedChanges ?? []).map((change) => key(change.uri.fsPath)),
        ...staged
    ]);
    return { changed, staged };
}
