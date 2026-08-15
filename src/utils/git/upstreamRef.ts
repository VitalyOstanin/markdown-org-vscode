/**
 * The upstream of a branch as the ref git may be handed, or nothing.
 *
 * Its own module because the answer decides what reaches a git command line:
 * the Git extension forwards a ref as a bare argument -- `log` pushes
 * `options.range` on its own, and `diffFiles` puts its `--` after the range --
 * so a remote called `--output=/tmp/x` would arrive at `git log` as the diff
 * option of that name and write a file.
 *
 * `git remote add` refuses a name starting with a dash, so reaching this takes a
 * hand-written `.git/config` in a repository opened here; the check is
 * hardening, not a fix for something the panel does to itself. A leading dash is
 * the whole of it -- every other character is part of a revision name as far as
 * git is concerned, and an unknown revision is already handled by the callers,
 * which log the failure and drop the unpushed half of the status.
 */
export interface GitUpstream {
    readonly remote: string;
    readonly name: string;
}

/** `origin/main`, or `undefined` when either half would be read as an option. */
export function upstreamRef(upstream: GitUpstream | undefined): string | undefined {
    if (!upstream || upstream.remote.startsWith('-') || upstream.name.startsWith('-')) {
        return undefined;
    }
    return `${upstream.remote}/${upstream.name}`;
}
