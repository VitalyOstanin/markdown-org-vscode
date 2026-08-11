# ADR-0018: The declared minimum VS Code version follows the Git API members we call

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Amends [ADR-0016](0016-git-status-via-git-extension-api.md),
whose resolution chain this version requirement comes from; the chain
itself is unchanged.

## Context

The git status chain resolves a source file to its repository through
`api.getRepositoryRoot(dirname(real))`. That member is not part of the
Git extension API on every host the manifest promised: checked against
`extensions/git/src/api/git.d.ts` in the `microsoft/vscode` repository,
the `API` interface declares `getRepository`, `openRepository` and `init`
in 1.85.0, 1.90.0 and 1.99.0, and gains
`getRepositoryRoot(uri: Uri): Promise<Uri | null>` in 1.101.0. The
manifest declared `^1.85.0`.

The gap is invisible to the compiler. The API is reached through the
hand-written slice in `src/utils/git/gitApiTypes.ts` (ADR-0016), so `tsc`
checks the call against our own declaration rather than against the
host's. It is invisible to the integration suite as well: `.vscode-test`
downloads the current stable, never the declared minimum.

At runtime on 1.85-1.100 the call lands on `undefined`, the `TypeError`
is caught by the chain's own `catch`, and the log records "cannot resolve
a repository" -- the chip silently disappears in exactly the arrangement
it was written for (a notes directory reached through a symlink, its
repository outside the workspace folders).

The alternative was to keep `^1.85.0` and treat the member as optional,
falling back to `api.openRepository(dir)`, whose model computes the root
itself on those releases. That keeps old hosts working at the price of a
second resolution branch that no test in this project can exercise.

## Decision

Declare the minimum host as the release that declares every Git API
member the code calls: `engines.vscode: ^1.101.0`. `@types/vscode` stays
pinned to that exact version, as the project already requires, so the
surface the code compiles against is the surface the manifest promises.

The rule generalises: when a new call is added to
`src/utils/git/gitApiTypes.ts` -- or to any other host API reached
through a hand-written declaration -- the minimum moves to the release
that introduced it. Optional members with runtime probes are not used
for this purpose, because a branch the test suite cannot reach is a
branch that is not known to work.

`src/test/unit/engineVersion.test.ts` holds the pair (`engines.vscode`,
`@types/vscode`) to that decision.

## Consequences

- VS Code 1.85-1.100 no longer installs the extension. Both marketplaces
  serve such hosts the last version that declared support for them, so
  they keep a working, older extension rather than nothing.
- The resolution chain of ADR-0016 needs no version probe and no second
  branch: the member is always there.
- The declared minimum and the version the integration suite actually
  runs against are closer together, which is what made the gap
  survivable in the first place.
- The minimum is now a moving floor. Adding a call to a recently
  introduced member raises it, and that cost is visible at the moment
  the call is added rather than at a user's runtime.

## References

- `src/utils/git/gitApi.ts` -- the call site (`repositoryForPath`).
- `src/utils/git/gitApiTypes.ts` -- the hand-written API slice.
- `src/test/unit/engineVersion.test.ts` -- the manifest invariant.
- [ADR-0016](0016-git-status-via-git-extension-api.md) -- the resolution
  chain this requirement follows from.
