# ADR-0016: Read the agenda's git status through the Git extension API

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Amended by [ADR-0018](0018-minimum-host-follows-the-git-api.md) (2026-08-11): the
chain below is unchanged, but step 3 requires a host of 1.101 or newer,
which the manifest now declares. Amended by
[ADR-0020](0020-panel-does-not-resolve-conflicts.md) (2026-08-14) on what the
chip shows: four counters rather than two, and the rules about a merge in
progress and a file whose repository could not be read.

## Context

The agenda shows tasks, not the state of the files they came from, so a
day's worth of edits can sit uncommitted -- or committed but unpushed --
with nothing in the panel saying so. The header now carries a chip with
two counters (files not committed, files touched by unpushed commits)
and the actions to resolve them.

Two questions had to be settled before writing it.

**Where the data comes from.** Either spawn `git status --porcelain=v2
--branch` through the existing `utils/exec.ts`, or read the built-in Git
extension's API (`vscode.git`). The CLI route means a porcelain parser,
a process per refresh, grouping by repository by hand, and a watcher to
know when to re-run. The API already holds parsed state per repository,
reports `HEAD.ahead`, and fires `state.onDidChange` on every move.

**How a source file finds its repository.** Agenda files are routinely
reached through a symlink: a notes directory linked into the home folder
while the repository lives elsewhere. `api.getRepository(uri)` only
matches repositories VS Code has already opened, so such a file resolves
to nothing -- the panel would report "outside git" for a file that is
plainly tracked.

## Decision

Read the status through the Git extension API, and resolve each source
file with this chain:

1. `fs.promises.realpath(file)`, falling back to the original path when
   it cannot be resolved (the file was deleted after the agenda was
   built).
2. `api.getRepository(real)`.
3. On a miss, `api.getRepositoryRoot(dirname(real))` -- a **directory**,
   because that call runs `git rev-parse --show-toplevel` with the given
   path as its working directory -- then `api.openRepository(root)`.
4. On a further miss, repeat 2-3 for the original path, which covers a
   symlink that is itself committed and points outside its repository.

A repository opened this way joins the Source Control view and stays
there. That side effect is accepted: without it the feature does not
work for the symlink arrangement it exists for.

A repository the workspace never opened arrives with empty change
groups, so `repository.status()` is forced once per root before its
state is read; afterwards the extension's own watchers keep it current.

Path matching happens on paths re-anchored to the repository's real
root, not on `realpath` of every changed path: a large repository
reports hundreds of changes, and one `realpath` per repository is enough
to make both spellings converge.

The unpushed half comes from `diffBetween(upstream, 'HEAD')`, which
diffs `upstream...HEAD` from the merge base, so commits that arrived on
the remote side do not count as ours.

## Consequences

- No porcelain parser, no process per refresh, and no watcher of our
  own: repository events drive the refresh, debounced at 300 ms.
- The feature is bound to the built-in Git extension. If it is missing
  or disabled (`git.enabled`), `getGitApi()` answers null once, the
  reason goes to the diagnostic log, and the chip is not rendered --
  the agenda itself is unaffected.
- Only the members listed in `src/utils/git/gitApiTypes.ts` are
  depended on. That file is a hand-written slice of the extension's
  `git.d.ts`, so a drift in the real API surfaces as a type error
  against a small, readable declaration.
- Opening a repository from the resolution chain changes the user's
  Source Control view. This is visible and permanent for the session.
- The counting rules are a pure function over plain data
  (`gitStatusModel.ts`), so they are unit tested without a host; the
  parts that need a real repository -- symlink resolution, `diffBetween`
  over a real commit graph, the scope of a commit -- are covered by the
  integration suite against a temporary repository reached through a
  symlink.

## References

- `src/utils/git/gitApi.ts` -- the resolution chain.
- `src/utils/git/collectGitStatus.ts` -- path canonicalisation and the
  per-repository snapshot.
- `src/utils/git/gitStatusModel.ts` -- the counting rules.
- `src/test/integration/gitStatus.integration.test.ts` -- the symlink
  and commit-scope cases.
- [ADR-0012](0012-webview-client-as-a-typed-project.md) -- why the
  status types live in `src/types.ts` rather than beside the model.
