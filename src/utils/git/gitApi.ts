/**
 * Access to the built-in Git extension, and the rule that maps an agenda source
 * file onto the repository it belongs to.
 *
 * The mapping is not `getRepository(file)`: agenda files are routinely reached
 * through a symlink (a notes directory linked into the home folder while the
 * repository lives elsewhere), and `getRepository` only matches repositories
 * VS Code has already opened. The chain below resolves the real path first,
 * then opens the repository if the workspace never did -- see ADR-0016 and the
 * behaviour notes in gitApiTypes.ts.
 *
 * Everything here degrades to "no git": a missing or disabled Git extension, a
 * path outside any repository, and an unreadable path all end as `undefined`
 * with a line in the diagnostic log, never as a thrown error -- the agenda must
 * still render.
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatError } from '../formatError';
import { logDiagnostic } from '../logChannel';
import type { GitApi, GitExtensionExports, GitRepository } from './gitApiTypes';

/** Resolved once per session; `null` records "asked, not available". */
let cachedApi: GitApi | null | undefined;
let reportedUnavailable = false;

/**
 * The Git extension's API, or `null` when git is not available.
 *
 * The extension is activated on demand: a workspace with no repository leaves
 * `vscode.git` installed but not started, and its exports are only there after
 * `activate()`. `enabled` reflects the `git.enabled` setting, which a user may
 * have turned off deliberately -- that is a "no git" answer, not an error.
 */
export async function getGitApi(): Promise<GitApi | null> {
    if (cachedApi !== undefined) {
        return cachedApi;
    }
    const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!extension) {
        reportUnavailable('the built-in git extension is not installed');
        cachedApi = null;
        return cachedApi;
    }
    try {
        const exports = extension.isActive ? extension.exports : await extension.activate();
        if (!exports.enabled) {
            reportUnavailable('the built-in git extension is disabled (git.enabled)');
            cachedApi = null;
            return cachedApi;
        }
        cachedApi = exports.getAPI(1);
    } catch (error) {
        reportUnavailable(`the built-in git extension failed to activate: ${formatError(error)}`);
        cachedApi = null;
    }
    return cachedApi;
}

/** Roots whose first status pass has already been forced (see below). */
const primedRoots = new Set<string>();

/**
 * Run one status pass on a repository the workspace did not open.
 *
 * Such a repository is handed over with empty change groups: the Git extension
 * fills them from its own scan, which has not happened at the moment
 * `openRepository` resolves, and a status read right after would report a clean
 * tree that is not clean. Forced once per root -- from then on the extension's
 * own watchers keep `state` current and the events feed the refresh.
 */
async function primeRepositoryState(repository: GitRepository, root: string): Promise<void> {
    if (primedRoots.has(root)) {
        return;
    }
    primedRoots.add(root);
    try {
        await repository.status();
    } catch (error) {
        // A refresh that fails leaves the (empty) state in place; the agenda
        // under-reports rather than failing to render.
        primedRoots.delete(root);
        logDiagnostic(`agenda git status: initial refresh of ${root} failed: ${formatError(error)}`);
    }
}

/** Once per session: the agenda refreshes often and this answer never changes. */
function reportUnavailable(reason: string): void {
    if (reportedUnavailable) {
        return;
    }
    reportedUnavailable = true;
    logDiagnostic(`agenda git status unavailable: ${reason}`);
}

/** Test-only hook: drop the cached API so a stub can take its place. */
export function __resetGitApiCacheForTesting(api?: GitApi | null): void {
    cachedApi = api;
    reportedUnavailable = false;
}

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

/** A file placed in its repository, with the path git will accept for it. */
export interface ResolvedRepositoryFile {
    repository: GitRepository;
    /** Path after `realpath` -- what `repo.add()` must be given. */
    realPath: string;
}

/**
 * Find the repository holding `file`, opening it when the workspace has not.
 *
 * Order matters. The real path is tried first, because that is where the
 * repository lives in the common symlink case (a linked notes directory). The
 * original path is tried second for the inverse case: a symlink that is itself
 * committed to a repository and points outside it, where the real path is not
 * under git but the link is.
 */
export async function resolveRepositoryFor(
    api: GitApi,
    file: string,
    realPathCache: Map<string, string>
): Promise<ResolvedRepositoryFile | undefined> {
    const realPath = await resolveRealPath(file, realPathCache);
    const viaReal = await repositoryForPath(api, realPath);
    if (viaReal) {
        return { repository: viaReal, realPath };
    }
    if (realPath !== file) {
        const viaOriginal = await repositoryForPath(api, file);
        if (viaOriginal) {
            return { repository: viaOriginal, realPath: file };
        }
    }
    return undefined;
}

/**
 * One path, three chances: an already-open repository, the repository root git
 * reports for the path, and finally opening that root.
 *
 * Opening has a visible side effect -- the repository joins the Source Control
 * view and stays there -- which is the accepted cost of supporting agenda files
 * that live outside the workspace folders (ADR-0016).
 */
async function repositoryForPath(api: GitApi, filePath: string): Promise<GitRepository | undefined> {
    const open = api.getRepository(vscode.Uri.file(filePath));
    if (open) {
        return open;
    }
    try {
        // A directory, not the file: `getRepositoryRoot` runs
        // `git rev-parse --show-toplevel` with the given path as the process
        // working directory, and spawning in a file fails with ENOTDIR.
        const root = await api.getRepositoryRoot(vscode.Uri.file(path.dirname(filePath)));
        if (!root) {
            return undefined;
        }
        await api.openRepository(vscode.Uri.file(root.fsPath));
        // `openRepository` returns the repository only when the model accepted
        // it as newly opened; an already-known root answers null while
        // `getRepository` finds it. Asking again covers both.
        const repository =
            api.getRepository(vscode.Uri.file(filePath)) ?? api.getRepository(vscode.Uri.file(root.fsPath));
        if (repository) {
            await primeRepositoryState(repository, root.fsPath);
        }
        return repository ?? undefined;
    } catch (error) {
        // `getRepositoryRoot` answers null for "not a repository"; anything that
        // throws is a real failure (a broken git binary, an unsafe repository
        // ownership refusal) and is worth a line in the log.
        logDiagnostic(`agenda git status: cannot resolve a repository for ${filePath}: ${formatError(error)}`);
        return undefined;
    }
}
