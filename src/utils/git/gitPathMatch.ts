/**
 * Path comparison for matching agenda source files against the paths the Git
 * extension reports.
 *
 * Two things make a plain string compare wrong here:
 *
 *  - Case. Windows and macOS resolve paths case-insensitively, Linux does not.
 *    The Git extension makes the same distinction internally (`pathEquals`),
 *    and a mismatch here would silently drop a file from the counters.
 *  - Symlinks. An agenda file may be reached through a symlink while the
 *    repository was opened under the real path (or the other way round), so
 *    callers resolve both sides with `realpath` first and compare the results
 *    through {@link pathKey}.
 *
 * Kept free of `vscode` and `node:fs` so the unit suite can exercise both
 * platform rules without a host: the platform is a parameter, defaulted to the
 * running one. Separators follow that same parameter rather than the running
 * platform, so a Windows checkout of the suite still sees POSIX rules for
 * `'linux'` -- `path.normalize` alone would rewrite `/repo/a` to `\repo\a`.
 */
import * as path from 'node:path';

/** Platforms that compare paths without regard to case. */
function isCaseInsensitive(platform: NodeJS.Platform): boolean {
    return platform === 'win32' || platform === 'darwin';
}

/** The path rules of `platform`, not of the machine the code runs on. */
function pathApi(platform: NodeJS.Platform): path.PlatformPath {
    return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * Canonical key for a path: normalized, without a trailing separator, and
 * lower-cased on the platforms where case does not distinguish files.
 *
 * The root itself keeps its separator -- `path.normalize('/')` is `/`, and
 * trimming it would turn the root into an empty key that matches nothing.
 */
export function pathKey(value: string, platform: NodeJS.Platform = process.platform): string {
    const api = pathApi(platform);
    const normalized = api.normalize(value);
    const trimmed =
        normalized.length > 1 && (normalized.endsWith(api.sep) || normalized.endsWith('/'))
            ? normalized.slice(0, -1)
            : normalized;
    return isCaseInsensitive(platform) ? trimmed.toLowerCase() : trimmed;
}

/** Whether two paths name the same location under the platform's rules. */
export function pathsEqual(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
    return pathKey(a, platform) === pathKey(b, platform);
}

/**
 * Whether `child` is inside `parent` (or is `parent` itself).
 *
 * Compared segment-wise through the keys rather than with `startsWith`, which
 * would report `/repo-backup` as living inside `/repo`.
 */
export function isInside(parent: string, child: string, platform: NodeJS.Platform = process.platform): boolean {
    const parentKey = pathKey(parent, platform);
    const childKey = pathKey(child, platform);
    if (parentKey === childKey) {
        return true;
    }
    const sep = pathApi(platform).sep;
    const prefix = parentKey.endsWith(sep) ? parentKey : parentKey + sep;
    return childKey.startsWith(prefix);
}

/**
 * Index a set of paths for repeated membership tests.
 *
 * Used to turn the change lists of a repository (working tree, index,
 * untracked, and the `upstream...HEAD` diff) into something an agenda file can
 * be looked up in once per file instead of scanned per file.
 */
export function buildPathSet(paths: Iterable<string>, platform: NodeJS.Platform = process.platform): Set<string> {
    const set = new Set<string>();
    for (const value of paths) {
        set.add(pathKey(value, platform));
    }
    return set;
}

/** Membership test against a set built by {@link buildPathSet}. */
export function pathSetHas(
    set: ReadonlySet<string>,
    value: string,
    platform: NodeJS.Platform = process.platform
): boolean {
    return set.has(pathKey(value, platform));
}
