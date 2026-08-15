# ADR-0020: The agenda panel reports a merge but never resolves one, and refuses to commit while it stands

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Amends [ADR-0016](0016-git-status-via-git-extension-api.md), which
described the chip as two counters and the actions that answer them; the source
of the status and the resolution chain it decided are unchanged.

## Context

ADR-0016 put the agenda's git status behind the built-in Git extension's API and
described what the panel shows: files with uncommitted changes, files touched by
unpushed commits, and the two actions that answer them.

Two states have been added since, and both are about what the panel will _not_
do. A repository can be mid-merge with paths still unresolved: the Git extension
keeps those in `state.mergeChanges`, apart from the working-tree and index
groups, so a panel counting only the latter files a conflicted note under
"clean" and offers to commit it. And a source file can have no repository at all
-- outside git, or inside one VS Code declined to open (a root outside the
workspace folders, which the extension opens only under
`git.openRepositoryInParentFolders`). Counting neither uncommitted nor unpushed,
such a file also passed for clean, which is a claim about a file nothing looked
at.

Both could be answered inside the panel. A conflict could be resolved from the
dropdown; an unreadable repository could be opened silently. Neither belongs
here: resolving a merge is a text-editing task with a purpose-built view in VS
Code, and a panel that started offering it would be a second, worse merge editor
whose failure modes land in notes the user did not ask it to touch.

## Decision

- **A merge in progress is reported, not resolved.** Unresolved paths get their
  own counter (`!`) and their own group in the dropdown, with a caption pointing
  at Source Control. The panel offers no resolution action of any kind.
- **The commit button steps aside while a merge stands**, and a commit reaching
  the host anyway is refused before the message is asked for, naming the
  repository. Git commits the whole index and would conclude the merge; that is
  a decision the user makes where the conflicts are shown.
- **The conflict count is the repository's, not the view's.** What it explains
  is why the button is gone, and that is decided by the repository -- including
  paths the agenda never reads.
- **A file whose state could not be read is "unknown" (`?`), never "clean".**
  The reason is written to the diagnostic log; the panel keeps rendering.
- **Push is never forced.** A refusal from the remote is explained -- which
  branch is behind which upstream -- and the missing commits are fetched
  elsewhere.

## Consequences

- The panel answers "is my plan saved" and stops there. Every state it cannot
  answer for is visible as a state, not hidden behind a reassuring checkmark.
- A user mid-merge sees the count and the group, and has to switch to Source
  Control to get the commit button back. That is one extra step, and it is the
  step where the conflicts are actually shown.
- The chip has four counters plus a clean marker, which is what the README and
  the module comments describe; adding a fifth state means adding it to
  `gitCounters` and to the glyph table together (`gitGlyph`), and the unit suite
  checks that the chip and the file rows use the same marks.
- Nothing here needs a setting: every rule is about what the panel refuses, and
  a switch to turn a refusal off would be a switch for committing during a
  merge.

## References

- Source of the status and the resolution chain: [ADR-0016](0016-git-status-via-git-extension-api.md)
- Counters and their marks: `src/utils/agendaGitHtml.ts` (`gitCounters`, `gitGlyph`)
- Model and the repository-wide conflict count: `src/utils/git/gitStatusModel.ts`
- Refusal to commit mid-merge: `src/commands/gitActions.ts`
- Behaviour notes on the Git API: `src/utils/git/gitApiTypes.ts`
