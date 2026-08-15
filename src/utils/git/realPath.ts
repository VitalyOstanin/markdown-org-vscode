/**
 * Resolving a path to its real spelling, with the answers remembered.
 *
 * Separate from `gitApi.ts` because nothing here needs the editor: it is
 * `fs.realpath` and a cache. That is what makes the modules built on it --
 * `repositoryPaths.ts` above all -- reachable from the unit suite, which runs
 * without a host and cannot import `vscode`.
 */
import * as fs from 'node:fs';

/**
 * Real path of `file`, with the original returned when it cannot be resolved.
 *
 * A missing file is expected rather than exceptional: the agenda payload is a
 * snapshot, and a task can outlive the file it was read from by the time the
 * status is recomputed. Falling back to the original path keeps such a file in
 * the "outside git" group instead of aborting the whole pass.
 */
export async function resolveRealPath(file: string, cache: Map<string, string>): Promise<string> {
    const cached = cache.get(file);
    if (cached !== undefined) {
        return cached;
    }
    let resolved = file;
    try {
        resolved = await fs.promises.realpath(file);
    } catch {
        // ENOENT (deleted since the agenda was built) and EACCES both land here.
    }
    cache.set(file, resolved);
    return resolved;
}
