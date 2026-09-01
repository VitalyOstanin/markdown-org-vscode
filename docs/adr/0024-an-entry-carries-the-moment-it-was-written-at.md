# ADR-0024: An entry carries the moment it was written at

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-09-01. Mirrors
[Android ADR-0040](https://github.com/VitalyOstanin/markdown-org-android/blob/master/docs/adr/0040-an-entry-carries-the-moment-it-was-written-at.md)
for the editor side.

## Context

`CREATED:` has been part of the on-disk contract since ADR-0005: an inactive
timestamp, `[2026-09-01 вт 14:01]`, which the agenda never reads as a date to
keep. The extension has had `Insert Created Timestamp` for as long, and it is a
command someone has to remember to run.

ADR-0023 gave the extension a way to write a whole entry at once: a phrase said
in one sentence becomes a heading and a planning line. Nothing in that path
marked when the entry was written, so an entry created this way could not
answer when it appeared — the question a note read months later asks first, and
the one that identifies the entries worth re-reading after a phrase was read
wrong.

The Android client had the same gap and closed it by marking every entry it
writes. Two clients writing the same files, one marking and one not, would
leave notes where the presence of a mark says which side the entry came from
rather than when it was created.

## Decision

An entry written from a phrase carries the moment it was written at: a
`CREATED:` line under the heading, above the planning line, in the inactive
brackets ADR-0005 fixed.

To the minute rather than to the day. A day alone cannot tell apart two entries
written the same day, which is exactly the pair a reader wants ordered when
looking at what was captured and in what order.

The moment is the one the command opened at — the same instant ADR-0023 fixes
the day from, so that a chain of phrases spanning midnight resolves "tomorrow"
to one day. Reading the clock a second time here could mark a moment no phrase
was read against.

The line is spelled the way this command spells the planning line beside it:
the indent the placement found, the inline-code framing, and the weekday names
of the UI language. What the mark says is the same on both clients; how it is
spelled follows each client's own rule for the lines it writes.

The mark is left out of the title of the input box. That title shows what would
be written so that a phrase read wrong is corrected by saying more; the mark
says now whatever the phrase said, and a line of it would take room from what
is being corrected.

`Insert Created Timestamp` stays as it is, for entries typed into the editor by
hand rather than said. It remains a no-op where a mark already stands, so
running it on an entry written from a phrase changes nothing.

## Consequences

Entries written from a phrase gain a line. Files hold entries of two kinds now
— marked and unmarked — and the unmarked ones are those written before this
release or typed by hand without the command. Nothing reads a missing mark as
an error.

A note written on the phone and a note written here read alike, which is what
lets the same file be edited from both without a reader being able to tell
which side an entry came from.

The mark is not shown in the agenda: the panel draws the heading and the
planning date, and an inactive timestamp under a heading is metadata the
extractor does not put on the timeline.

## References

- [ADR-0005: Active and inactive timestamps (editor side)](0005-active-and-inactive-timestamps.md)
- [ADR-0023: A task is written by saying it, and the core is what reads the phrase](0023-a-task-is-written-by-saying-it.md)
- [Extractor ADR-0014: Active and inactive timestamps](https://github.com/VitalyOstanin/markdown-org-extract/blob/master/docs/adr/0014-active-and-inactive-timestamps.md)
- [Android ADR-0040: An entry carries the moment it was written at](https://github.com/VitalyOstanin/markdown-org-android/blob/master/docs/adr/0040-an-entry-carries-the-moment-it-was-written-at.md)
