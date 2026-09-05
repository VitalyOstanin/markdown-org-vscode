# ADR-0028: A move is written in full, and half a move is warned about

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-09-05. Amends
[ADR-0027](0027-a-refused-move-is-warned-about-where-it-is-written.md) on what
is warned about: a line the extractor reads but this extension no longer
writes is warned about too, and so is a move standing in an entry that does not
repeat. Everything else ADR-0027 decided -- where the rules live, the order
among them, one fix per fault -- is unchanged.

## Context

ADR-0027 drew the line at what the extractor refuses: a `MOVED` line it reads
was left alone, on the reasoning that a file written by an older client should
not light up. Using the result showed two gaps.

The occurrence written bare -- `MOVED: 2026-09-07 -> <2026-09-09 Ср 13:00>` --
is read by the extractor and was therefore silent. But it is exactly the half
that cannot be edited with the date keys, which is why ADR-0039 of the
extractor changed the written form in the first place. A reader who meets the
old form has no way to learn that from the editor, and no way to convert it
short of typing brackets by hand.

A move standing in an entry whose planning line carries no repeater was silent
as well. There are no occurrences in such an entry: it has one date, and the
line names a day the series never draws. The extractor does not refuse the
line -- it refuses nothing about the entry it stands in -- so nothing said so.

The line this extension writes had a third gap of its own. Where the series'
own planning line named no weekday, neither half of the written line named one,
and a day written as digits alone says nothing about a step that landed on the
wrong day. The weekday beside the date is what makes a wrong step visible, and
it was being dropped exactly where the file offered no example to copy.

## Decision

Two more faults are warned about, under the same source and code ADR-0027 set:

- an occurrence written bare, with a Quick Fix that writes it as the inactive
  timestamp of the extractor's ADR-0039, weekday and all;
- a `MOVED` line in an entry that does not repeat, with no fix -- the answer is
  either a repeater on the entry or an edit of the date itself, and which of
  the two was meant is not in the line.

The entry fault is reported beside whatever the line itself says rather than
instead of it. They are two corrections, and hiding one behind the other means
finding the second only after the first is made.

A written `MOVED` line always names the weekday on both halves. The spelling is
the series' own where its planning line has one; failing that, the first
weekday the file writes anywhere; failing that, English. The date beside it
names the day either way, so a guessed language is a cosmetic miss rather than
a wrong statement.

## Consequences

- A file carrying the older bare form now shows a warning per move. That is the
  point -- the form is convertible in one keystroke, and the conversion is what
  makes the address editable -- but a file of many old moves lights up until
  they are taken.
- The extension warns about more than the extractor refuses. The messages say
  which is which: a refusal names the ADR it comes from, and these two say what
  the editor cannot do with the line rather than what the reader cannot read.
- Reading the entry for a repeater means the diagnostics now depend on the
  planning line, not only on the `MOVED` line. Both bracket forms of a planning
  line are read for it, so an entry whose planning line is written inactive --
  a fault the bracket diagnostics already report -- is not also called a
  non-repeating entry.
- A line written where the file names no weekday carries an English one. A file
  in Russian that has not yet written a single weekday is the only case, and
  the next move in it copies whatever the first one wrote.

## References

- [ADR-0027: A refused move is warned about where it is written](0027-a-refused-move-is-warned-about-where-it-is-written.md)
- [ADR-0005: Active and inactive timestamps](0005-active-and-inactive-timestamps.md)
- markdown-org-extract ADR-0038 and ADR-0039 — the rules being repeated
