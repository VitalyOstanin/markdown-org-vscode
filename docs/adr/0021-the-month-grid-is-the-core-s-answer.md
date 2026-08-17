# ADR-0021: The month grid is the core's answer, not the panel's reconstruction

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-08-17.

## Context

The month view drew a calendar the panel built for itself. It asked
`markdown-org-extract` for `--agenda month` -- the days of the month and
nothing more -- and then padded that month out to whole weeks in the page:
leading days from the previous month, trailing days from the next, enough to
fill the last row.

Those padding cells were dates the payload said nothing about. A task scheduled
on 30 November is in November's agenda, not December's, so December's leading
cell -- which shows 30 November and drills down into it -- was drawn empty, and
its count denied work the Day view then showed. The same held at the other
edge, and the last row of a month that ends mid-week is padding for four to six
days at a time.

The rule the padding follows is also not the page's to choose. Which weeks a
month touches depends on the day the week begins on, and the extractor applies
that rule when it decides what a week is (its ADR-0028). Two implementations of
one rule, in two languages, were free to disagree -- and the page's had a
second source of drift: `markdown-org.firstDayOfWeek` accepts `auto`, resolved
from `Intl.Locale.weekInfo` in whichever runtime asked. The webview and the
extension host need not answer that identically.

Extractor 0.17.0 added the scope this needs: `--agenda month-grid` answers with
the whole weeks the anchor month touches, beginning on the day `--week-start`
names, padding days included and carrying their tasks (its ADR-0028 and
ADR-0030).

## Decision

The month view asks for `--agenda month-grid --week-start <weekday>` and lays
out the days it receives, in the order they arrive. `buildMonthGrid` no longer
computes dates: it reads each day's date for the number to print, whether the
date falls outside the anchor month, whether it is a weekend and whether it is
today.

`markdown-org.firstDayOfWeek` is resolved once, in the extension host, before
the call. `auto` is answered there from `markdown-org.dateLocale`, and the page
receives `monday` or `sunday` -- never `auto` -- so the column headings are
drawn from the same value the extractor was given.

## Consequences

- A day at the edge of the grid shows what is dated to it, and its chip agrees
  with the Day view behind it.
- The rule "which weeks does this month touch" has one implementation, in the
  core, shared with the Android client.
- The bundled extractor must be at least 0.17.0, and so must a binary named by
  `markdown-org.extractorPath`: an older one rejects the scope outright rather
  than degrading, and the month view fails to open. The version warning names
  this.
- A month is one call, as before. The window is up to six days wider at each
  end, which is a longer sweep for the core and no extra work for the page.
- The page can no longer draw a calendar without a payload. An empty answer
  lays out no cells rather than an empty month; nothing else in the panel
  depends on a grid being present.

## References

- `src/utils/agendaMonthCells.ts` -- `buildMonthGrid`, the layout.
- `src/commands/agenda.ts` -- the call the month view makes.
- `src/utils/agendaWeekStart.ts`, `src/utils/agendaCalendarHtml.ts` --
  resolving the setting to a weekday, once.
- markdown-org-extract ADR-0028 (the first day of the week and the grid) and
  ADR-0030 (an explicit window in the month grid).
