# ADR-0017: Marking a repeating task done moves it forward

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted (2026-07-31).

## Context

A task can carry a repeater: `` `SCHEDULED: <2026-07-30 Чт ++7d>` ``. Marking
such a task done does not mean it is finished — this occurrence is, and the
next one is due later. Emacs Org-mode does this in `org-auto-repeat-maybe`
(lisp/org.el): the planning dates move and the keyword goes back to open.

`markdown-org.setDone` rewrote the keyword and nothing else. The Android
client of the same ecosystem moves the dates (its ADR-0009), so the same task
in the same file ended in different states depending on which client closed
it: a repeating task closed in the editor kept a date in the past under a
`DONE` keyword — a state Org-mode never produces, and one the agenda keeps
showing as overdue.

The shared rules live in the core, but they are not reachable from here: the
extension runs `markdown-org-extract` as a process and that binary reads,
never writes. Handing it the file would also mean writing behind the editor's
back, while the buffer the user is looking at may hold unsaved changes.

## Decision

The rules are implemented in TypeScript, in `src/utils/repeater.ts` and
`src/utils/completeRepeatingTask.ts`, read from upstream and from the core's
`planning.rs` so that the two clients land on the same date:

- `+N` takes exactly one step from the date in the file, even when the result
  is still in the past;
- `++N` keeps stepping until it passes today, taking at least one step;
- `.+N` restarts from today;
- month arithmetic clamps — 2026-01-31 plus a month is 2026-02-28 — which is
  deliberately not what `incrementTimestamp` does for Shift+Up on the month
  field, where the overflow into the next month is org's own behaviour for
  `org-timestamp-change`. Two operations, two rules.

The two divergences from upstream the core documents are kept: a `SCHEDULED`
line without a repeater is left in place rather than deleted, and plain
timestamps in the body are not touched.

`wd` (working days) is refused rather than approximated. Working days depend
on the public calendar, and the extractor publishes the holidays (`--holidays`)
but not the Saturdays moved to working, which its own calendar carries. Counting
without them would put the editor a day or two off the phone — the disagreement
this decision exists to remove. The user is told, and the file is left alone.
An hourly repeater is refused for the same reason the core refuses it: it moves
a time of day, not a date.

## Consequences

- A repeating task closed in the editor behaves as it does in Emacs and on the
  phone: the dates move, the keyword returns to `TODO`, and a heading that
  carried no keyword still carries none.
- The repeater rules now exist twice, in Rust and in TypeScript. What holds
  them together is a shared set of examples: the unit tests here use the dates
  the core's own tests use, so a change on either side that moves a task to a
  different day fails a run.
- `wd` remains a client difference, in the direction of refusing rather than
  guessing. Closing it means the extractor publishing its working days as well
  as its holidays.
- Clearing `DONE`, or marking a task cancelled, moves nothing: only applying
  `DONE` completes an occurrence.

## References

- `src/utils/repeater.ts`, `src/utils/completeRepeatingTask.ts` — the rules and
  what they rewrite.
- `src/commands/taskStatus.ts` — where `setDone` consults them.
- [`markdown-org-android`](https://github.com/VitalyOstanin/markdown-org-android)
  — ADR-0009 and `rust/markdown-org-ffi/src/planning.rs`, the reading these
  rules follow.
