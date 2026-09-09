# Repeating tasks

A repeater is a cookie inside the timestamp, and it says the entry comes back:

```markdown
## TODO Team sync
SCHEDULED: <2026-09-09 Wed 14:00 +1w>
```

| Cookie | What it means                                                             |
| ------ | ------------------------------------------------------------------------- |
| `+1w`  | every week from the day written                                           |
| `++1m` | every month, stepped forward past today when the entry was left behind    |
| `.+2d` | two days after the entry was closed, not after the day it was planned for |

Days, weeks, months and years are `d`, `w`, `m` and `y`. `Set DONE` on a
repeating task does not close it: it steps the timestamp to the next
occurrence, and the entry stays open for it.

## One occurrence that differs

A repeater describes an endless series and has nowhere to say that one of its
occurrences is not like the rest. Two commands write that down inside the entry
itself, and the agenda, the editor and the Google Calendar export all read what
was written:

- `markdown-org.cancelOccurrence` -- **Cancel One Occurrence** adds the day to
  the series' own `EXDATE`. The series goes on repeating; the agenda leaves out
  that one day.
- `markdown-org.moveOccurrence` -- **Move One Occurrence** writes a `MOVED`
  line of the series: before the arrow is the occurrence, after it is where the
  occurrence is held instead. Nothing has to be excluded as well, and the day is
  drawn once -- at its new hour.

````markdown
## TODO English
`SCHEDULED: <2026-08-06 Thu 15:00 +1w>`
`MOVED: [2026-08-20 Thu] -> <2026-08-27 Thu 18:00>`
```org-properties
EXDATE: 2026-08-13
```
````

Neither command asks for a date to be typed: the day is chosen from the ones
the series actually falls on, with the days already cancelled or moved listed
among them and marked as such. From the agenda both are reached through the ↻
of the row itself; a repeating `DEADLINE` flies ⚑ instead, and its flag opens
the same two.

## What the two halves of a MOVED line may carry

The move stands where the series is, which is where a reader looks for it: a
class moved to Wednesday is one line under the class rather than an entry at
the end of the file. The line is written the way the planning lines around it
are -- an inline-code span, at their indentation, with the weekday spelt as the
file spells it.

| Half             | Form              | May carry                        | May not carry                         |
| ---------------- | ----------------- | -------------------------------- | ------------------------------------- |
| before the arrow | inactive, `[...]` | a day and a weekday              | an hour, a repeater, a warning cookie |
| after the arrow  | active, `<...>`   | a day, an hour, a range of hours | a repeater, a warning cookie          |

Both halves name a weekday: a day written as digits alone says nothing about a
step that landed on the wrong day. A line the rules refuse is warned about in
the editor under the `markdown-org` source rather than dropped from the agenda
in silence, and `Ctrl+.` offers the fix where there is one.

## What a move cannot say

One occurrence has no state, no body and no clocks of its own, so marking a
single occurrence `DONE` is not expressible -- what a move says is where the
occurrence is held, and nothing else.

## The older shape, still read

An occurrence moved before this model existed is a second entry carrying
`SERIES_ID` and `RECURRENCE_ID` -- the shape iCalendar's own exception maps
onto. Files written that way are still read, and moving such an occurrence
again rewrites that entry where it stands rather than converting the file. A
`MOVED` line needs no `ID` on the series: a line inside the entry points at
nothing.
