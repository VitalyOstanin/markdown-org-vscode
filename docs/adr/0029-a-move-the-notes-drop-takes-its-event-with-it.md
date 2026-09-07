# ADR-0029: A move the notes drop takes its calendar event with it

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-09-07.

## Context

An occurrence held on another day is pushed to Google Calendar as an event of
its own, keyed by the series' event id and the day the occurrence left
(`movedEventId`). That much was decided when moves were first exported: Google
has no way to be handed an instance override on a series it has not expanded,
and the day the occurrence left is out of the rule as an `EXDATE` anyway.

What was never decided is what happens when the move stops existing. A `MOVED`
line is a line of the series -- it carries no `ID`, and nothing in the notes
survives its deletion. A later run reading the entry sees a series with one
fewer move and has no way to tell an occurrence that was never held elsewhere
from one that stopped being: both look the same. The event therefore stood in
the calendar for good, on a day the series had gone back to covering itself, so
the day held two.

Two ways out were weighed. The calendar could be asked -- every moved event
already carries `mdOrgOccurrence` in its extended properties, and a marker
naming the series would make them findable with `events.list`. That needs no
change to the user's files, but it costs one listing request per repeating
entry per run: the run is already bounded by a time budget and a rate limit,
and the question is asked of every series, not only of the ones that changed.
It is also unsound in a narrower way: the answer would name events for entries
outside this run's directories, and the run has no way to tell those from
orphans.

## Decision

The days an entry has moved-occurrence events out for are written back into the
entry, as `GCAL_MOVED` in its `org-properties` block (ADR-0009), beside
`GCAL_EVENT_ID`:

    ```org-properties
    ID: 7b1e...
    GCAL_EVENT_ID: 7b1e...
    GCAL_MOVED: 2026-08-20 2026-09-03
    ```

A run reads that list, compares it with the days the entry's `MOVED` lines now
name, and deletes the event of every day the notes have dropped -- before the
series itself is written, so the day is free by the time the rule expands over
it again. An entry that stops being pushed at all (DONE with `onDone: delete`,
or CANCELLED) takes its moved events with it in the same way. The list is
written back afterwards, holding the days whose events are actually out there:
a day whose write was refused stays out of it, and a day whose delete failed
stays in.

Like `GCAL_EVENT_ID`, the property is a cache rather than a source of truth: a
deferred write-back is harmless, because the next run derives the event id from
`ID` and reads the days again. Deletion is idempotent (404 and 410 count as
success), so a list that is one run out of date costs a request, not a failure.

The day itself is checked before the calendar is asked, with the same predicate
that keeps a day out of the `EXDATE` (`isIsoDate`). A `MOVED` line is written
by hand, and a day that is not a day used to be answered by Google -- after the
event of the series had already gone out.

## Consequences

Easier:

- A move taken back out of the notes leaves nothing behind, and the day it
  named goes back to being drawn once.
- The memory travels with the notes: a file synced to another machine carries
  the days its events were written for.
- No listing requests are added, and nothing outside the entry being written is
  ever deleted -- a directory temporarily out of `gcalSync` loses nothing.

Harder:

- Another service property appears in the user's files, and an entry whose
  moves change is written back more often.
- Deleting the `org-properties` block by hand loses the memory, and the events
  of moves already dropped stay in the calendar; nothing else notices.
- The property records what the calendar holds, so an event deleted in Google
  by hand leaves the day listed until the next run tries to delete it again.

## References

- [ADR-0009](0009-task-properties-org-properties-block.md) -- the
  `org-properties` block this property lives in.
- [ADR-0010](0010-google-calendar-sync.md) -- the one-way push this belongs to.
- `src/utils/gcal/syncEngine.ts` -- the run, the deletion and the write-back.
- `src/utils/gcal/eventId.ts` -- `movedEventId`, and the day it refuses.
- extractor ADR-0038 -- the `MOVED` line an occurrence is held with.
