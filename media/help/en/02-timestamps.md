# Timestamps

A date under a heading is what puts the task on a day of the agenda. The line
carries a planning keyword and a timestamp:

```markdown
## TODO Review the release notes
SCHEDULED: <2026-09-09 Wed 09:30-10:00>
```

## The planning keywords

| Keyword     | What it says                                                             |
| ----------- | ------------------------------------------------------------------------ |
| `SCHEDULED` | the day the work is meant to start                                       |
| `DEADLINE`  | the day it is due; the agenda warns ahead of it                          |
| `CREATED`   | the day the entry was written, which is what orders two same-day entries |

Four commands write them at the cursor:

- `markdown-org.insertCreated` -- **Insert CREATED Timestamp**
- `markdown-org.insertScheduled` -- **Insert SCHEDULED Timestamp**
- `markdown-org.insertDeadline` -- **Insert DEADLINE Timestamp**
- `markdown-org.insertTimestamp` -- **Insert Timestamp (no keyword)**, for a
  date inside a sentence rather than a planning line

The weekday inside the brackets is written in the language
`markdown-org.weekdayLocale` names -- `ru` writes `Пн`, `en` writes `Mon` --
while `markdown-org.dateLocale` decides how the agenda formats the dates it
shows.

## Active and inactive

`<2026-09-09 Wed>` is active: it puts the entry on that day of the agenda.
`[2026-09-09 Wed]` is inactive: it records a date without planning anything,
which is what `CREATED` uses.

- `markdown-org.toggleTimestampActive` -- **Toggle Timestamp Active/Inactive**
  swaps the brackets under the cursor.

## Adjusting a date without retyping it

With the cursor on any part of a timestamp -- the year, the month, the day, the
hour, the minute, the repeater -- two commands step that part:

- `markdown-org.timestampUp` -- **Timestamp Up**
- `markdown-org.timestampDown` -- **Timestamp Down**

The weekday is rewritten to match, so a date stepped past the end of a month
stays correct.

## Tracking time with CLOCK

A `CLOCK` line records a stretch of work on the task above it:

```markdown
## TODO Write the report
CLOCK: [2026-09-09 Wed 10:00]--[2026-09-09 Wed 11:30] =>  1:30
```

- `markdown-org.insertClockStart` -- **Insert CLOCK Start** opens a stretch.
- `markdown-org.insertClockFinish` -- **Insert CLOCK Finish** closes the open
  one and writes the duration.
- `markdown-org.insertClockTable` -- **Insert CLOCK Table** sums the stretches
  of a file into a table, and rewrites the table in place when run on one that
  is already there.

`markdown-org.clockRoundMinutes` rounds what is written: `15` rounds to a
quarter of an hour, `0` leaves the minute as it is.
