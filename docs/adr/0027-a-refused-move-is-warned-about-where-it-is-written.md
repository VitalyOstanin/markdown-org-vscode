# ADR-0027: A refused move is warned about where it is written

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-09-05. Amended by
[ADR-0028](0028-a-move-is-written-and-warned-about-in-full.md) (2026-09-05):
an occurrence written bare and a move in an entry that does not repeat are
warned about as well, and a written line always names the weekday.

## Context

A `MOVED` line holds one occurrence of a series on another day (the
extractor's ADR-0038, in the written form of its ADR-0039). What the line may
say is narrow: before the arrow a day and only a day, written bare or as an
inactive timestamp; after it an active timestamp that may name a weekday, an
hour and a range of hours, and may carry neither a repeater nor a warning
cookie.

The extractor refuses a line that says anything else, and it says so through
the `org-properties` warning channel — a place a reader of the agenda does not
look. What the reader sees instead is the occurrence still drawn on the day it
was moved away from, with nothing on the screen connecting that to the line
just typed. A move written by this extension is always well-formed; a move
typed or edited by hand is where the refusals are met, and that is exactly
where the report was absent.

The editor already answers a rule of the same kind at the point of writing:
the bracket policy of [ADR-0005](0005-active-and-inactive-timestamps.md) is a
warning under the `markdown-org` diagnostic source with a Quick Fix beside it.
The shape is proven, and a second rule does not need a second idea.

## Decision

Every `MOVED` line the extractor would refuse is a warning in the editor, under
the same `markdown-org` source, with the code `moved-policy`. The pure rules
live in `src/diagnostics/movedPolicy.ts` and the vscode adapter in
`src/diagnostics/movedLineDiagnostics.ts`, mirroring the bracket pair.

The reported faults, and the order among them, are the extractor's own: it
stops at the first refusal, so a line carrying two is warned about for the one
its reader reaches. The warning underlines the half at fault, not the whole
line.

A fault whose correction is guessable carries a Quick Fix, and the fix takes
out exactly one fault — dropping a repeater leaves an hour standing, and the
hour is warned about on the pass after. A half that is not a date, and a day
the same entry already moves, carry no fix: the line does not hold what was
meant.

The rules are duplicated between the extractor and this extension deliberately.
Asking the binary per keystroke is a process per edit, and the extension
already carries the same grammar for highlighting and for stepping timestamps
with the date keys; the check is the grammar it already has.

## Consequences

- A refusal is read where the line is written, at the moment it is written,
  instead of in a channel that is only opened deliberately.
- The rules exist in two places, and a change to the extractor's reader has to
  be brought here as well. The refusal messages name the ADR each rule comes
  from, so the pairing is traceable rather than remembered.
- A line that is legal but unusual — a bare occurrence, which the extractor
  still reads — is not warned about. Warnings mark what the extractor refuses,
  not what this extension prefers, so a file written by an older client does
  not light up.
- The check is per document and per entry: a heading starts a new one, which
  is what makes "this entry already moves that day" answerable without asking
  the extractor to parse the file.

## References

- [ADR-0005: Active and inactive timestamps](0005-active-and-inactive-timestamps.md) —
  the bracket policy this follows in shape and in wiring
- markdown-org-extract ADR-0038 and ADR-0039 — the rules being repeated
