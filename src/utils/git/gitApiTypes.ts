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
