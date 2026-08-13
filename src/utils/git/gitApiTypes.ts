/**
 * The slice of the built-in Git extension's API this extension actually calls.
 *
 * VS Code ships the full declaration as `extensions/git/src/api/git.d.ts`, but
 * that file is not published on npm and its members drift between releases.
 * Copying all of it would import a large surface we never touch; declaring only
 * what is called keeps the coupling visible -- every member below is used
 * somewhere in `src/utils/git/`, and anything missing is a member we decided
 * not to depend on.
 *
 * Because the declaration is ours, the compiler cannot tell whether the host
 * actually has a member: adding one here is a claim about the minimum version
 * in `engines.vscode`, which moves to the release that introduced it
 * (ADR-0018). `getRepositoryRoot` is why that minimum is 1.101.
 *
 * Behaviour worth knowing, verified against the shipped extension rather than
 * assumed:
 *
 *  - `getRepository` only matches repositories VS Code has already opened. A
 *    file reached through a symlink into a repository outside the workspace
 *    folders returns null here, which is why `getRepositoryRoot` and
 *    `openRepository` are part of the resolution chain (see gitApi.ts).
 *  - `getRepositoryRoot` falls back to `git rev-parse --show-toplevel` for the
 *    given path and returns null for `NotAGitRepository` / `NotASafeGitRepository`.
 *  - `diffBetween(ref1, ref2)` diffs `ref1...ref2` (three dots -- from the merge
 *    base), which is what "changed by commits we have not pushed" means.
 */

/** A path VS Code reports as changed. Only the URI is read. */
export interface GitChange {
    readonly uri: { readonly fsPath: string };
}

/**
 * One commit, as `log` returns it. `message` is the full text; the panel shows
 * only its first line, so the subject is taken here rather than asked for.
 */
export interface GitCommit {
    readonly hash: string;
    readonly message: string;
}

/** The `log` options this extension passes. `range` is `upstream..HEAD`. */
export interface GitLogOptions {
    readonly range?: string;
    readonly maxEntries?: number;
}

/** The branch HEAD points at. `ahead` is absent when there is no upstream. */
export interface GitBranch {
    readonly name?: string;
    readonly upstream?: { readonly remote: string; readonly name: string };
    readonly ahead?: number;
    readonly behind?: number;
}

export interface GitRepositoryState {
    readonly HEAD?: GitBranch;
    readonly workingTreeChanges: readonly GitChange[];
    readonly indexChanges: readonly GitChange[];
    /**
     * Untracked files. Older Git extensions folded these into
     * `workingTreeChanges`, so readers must treat the property as optional
     * rather than assume the bucket exists.
     */
    readonly untrackedChanges?: readonly GitChange[];
    /**
     * Paths left unresolved by a merge, rebase or cherry-pick. Non-empty means
     * the repository is mid-operation, and a commit made now would carry
     * whatever else that operation staged -- which is why this extension
     * refuses to commit rather than narrowing the paths further. Optional for
     * the same reason as `untrackedChanges`: it is a bucket the API grew.
     */
    readonly mergeChanges?: readonly GitChange[];
    readonly onDidChange: (listener: () => void) => { dispose: () => void };
}

export interface GitRepository {
    readonly rootUri: { readonly fsPath: string };
    readonly state: GitRepositoryState;
    /**
     * Force a refresh of `state`. A repository the workspace never opened
     * arrives with empty change groups -- they are filled by the extension's
     * own first status pass, which has not run yet at the moment
     * `openRepository` resolves.
     */
    status: () => Promise<void>;
    add: (paths: string[]) => Promise<void>;
    commit: (message: string) => Promise<void>;
    push: (remoteName?: string, branchName?: string, setUpstream?: boolean) => Promise<void>;
    diffBetween: (ref1: string, ref2: string) => Promise<GitChange[]>;
    log: (options?: GitLogOptions) => Promise<GitCommit[]>;
}

export interface GitApi {
    readonly repositories: readonly GitRepository[];
    getRepository: (uri: { readonly fsPath: string }) => GitRepository | null;
    getRepositoryRoot: (uri: { readonly fsPath: string }) => Promise<{ readonly fsPath: string } | null>;
    openRepository: (uri: { readonly fsPath: string }) => Promise<GitRepository | null>;
    onDidOpenRepository: (listener: (repo: GitRepository) => void) => { dispose: () => void };
    onDidCloseRepository: (listener: (repo: GitRepository) => void) => { dispose: () => void };
}

export interface GitExtensionExports {
    readonly enabled: boolean;
    getAPI: (version: 1) => GitApi;
}
