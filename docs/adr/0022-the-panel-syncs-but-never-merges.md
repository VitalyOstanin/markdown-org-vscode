# ADR-0022: The panel syncs in one press, and fast-forwards rather than merges

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Amends [ADR-0020](0020-panel-does-not-resolve-conflicts.md), which
set out what the panel refuses to do with a repository; the refusals there are
unchanged and this adds the action they now also govern.

## Context

The dropdown offered commit and push, and both act on this side only. What the
other side has is invisible to them: a note written on the phone reaches the
remote and stops there, and the desktop shows the agenda it had before, with a
clean chip, because every counter the chip carries is counted here.

Fetching was left to Source Control, and that is where it stayed -- the
sequence is `git fetch`, read what came, `git pull`, and it has to be done in a
view the reader left the agenda to reach. The mobile client has had one control
for the whole exchange since it shipped, and the two clients share the
repositories: an arrangement one of them makes the reader assemble by hand is
one the reader will assemble wrongly, or not at all.

The step that makes this awkward is the one in the middle. A branch that is
behind can be moved forward without a decision; a branch that is both behind
and ahead cannot. The Git extension's `pull` is `git pull` -- it merges, and
with a rebase configured it rebases -- so calling it unconditionally would put
merge commits, or a rewritten local history, into notes under a button labelled
with neither.

## Decision

- **One press does both directions**, in the order the exchange requires:
  fetch, then move whichever side has something to move.
- **The fast-forward is a property of the order, not of a flag.** `pull` is
  called only where `ahead` is zero, so the branch has nothing of its own for a
  merge to be made out of. Nothing is passed to make it fast-forward -- the
  precondition is checked instead, which is a claim this code can verify.
- **A branch that has diverged is left exactly as it stands**, and the panel
  says so, naming the branch and its upstream. Merging and rebasing are
  decisions with an author; they belong in Source Control, the same place
  ADR-0020 sends an unresolved merge.
- **The button is offered wherever there is a repository at all**, and gated on
  no counter. What it answers for is the other side, which no counter here can
  see -- including the state where this side is clean and the chip says so.
- **Push stays unforced**, as ADR-0020 requires; a refusal arriving between the
  fetch and the push is reported in the push button's own words, because it is
  the same event with the same next step.

## Consequences

- The reader gets the phone's control on the desktop: one press, and the two
  agendas agree. What used to require leaving the panel is now a state the
  panel reports.
- A divergence is announced rather than resolved, so the reader still ends up
  in Source Control for that case. That is the case where a decision is owed,
  and it is the rarer one.
- `fetch` and `pull` join the slice of the Git API this extension declares
  (`gitApiTypes.ts`). Both have been in the API since version 1, so the minimum
  host stated in `engines.vscode` does not move (ADR-0018).
- Every press reaches the network, including the one where nothing has changed
  here. That is what a fetch is; the alternative is not knowing.
- The dropdown now has three actions, and the two counted ones appear and
  vanish. Sync is rendered first so that it keeps its place -- a button that
  moves under the pointer between two renders is a button pressed by accident.

## References

- What the panel refuses to do to a repository: [ADR-0020](0020-panel-does-not-resolve-conflicts.md)
- Minimum host and the API slice: [ADR-0018](0018-minimum-host-follows-the-git-api.md)
- The action: `src/commands/gitActions.ts` (`syncAgendaSources`)
- The button and its gate: `src/utils/agendaGitHtml.ts` (`gitActions`)
- The same exchange on the phone: `rust/markdown-org-ffi/src/sync.rs` in
  `markdown-org-android`
