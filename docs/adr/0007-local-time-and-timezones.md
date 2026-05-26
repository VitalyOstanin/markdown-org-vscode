# ADR-0007: Local wall-clock dates; timezone awareness lives in the extractor

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted.

## Context

Org-mode timestamps are wall-clock values with no timezone component:
`<2025-12-09 Tue 14:30>` means 14:30 local time, wherever the file is
opened (see ADR-0003 for the wire format). The project therefore has to
decide how to compute dates -- especially "today", which drives the
agenda's day boundaries -- without contradicting that wall-clock
semantics.

Two layers handle dates:

- The editor (this repo, TypeScript) formats day headers, cycles
  timestamps, records CLOCK entries, and decides which day is "today"
  for scrolling and highlighting.
- `markdown-org-extract` (Rust) scans files and buckets tasks into the
  agenda window relative to a reference "today".

If the two layers computed "today" independently with different rules,
they could disagree across a midnight boundary (the editor highlights
one day while the extractor buckets tasks against another), or a UTC
conversion could shift a wall-clock date by a day for users west/east
of UTC.

## Decision

**The editor operates purely in host local time. The extractor owns
timezone awareness, but the editor overrides it on every call.**

Editor side (this repo):

- All date construction is local: `parseLocalDate` builds
  `new Date(y, m - 1, d)` (local midnight), `toIsoDate` formats via
  `getFullYear/getMonth/getDate`, CLOCK and timestamp editing use
  `getHours/getMinutes` / `setHours/setMinutes`. No `toISOString`,
  `Date.UTC`, `getTimezoneOffset`, or `getUTC*` anywhere in production
  code.
- "Today" is `toIsoDate(new Date())` -- the host's local calendar day.
- The next-midnight refresh timer is computed in local time
  (`msUntilNextLocalMidnight`).

Extractor side (`markdown-org-extract`):

- It can resolve "today" from an IANA timezone:
  `compute_today_in_tz(Utc::now(), tz)` via `chrono` / `chrono-tz`.
- That path is only taken when no explicit reference date is supplied.

The contract between them:

- The editor **always** passes `--date <local today>` when requesting an
  agenda. In the extractor that value is `current_date_override` and
  takes precedence over the timezone computation. So when the extractor
  runs under the extension, its IANA-timezone branch is never reached --
  "today" is decided once, in the editor, from host local time, and
  handed over as a fixed `YYYY-MM-DD`.

## Consequences

Easier:

- Matches Org-mode's wall-clock semantics and the Emacs reference
  (`org-today` is local time); files mean the same day in either tool.
- No cross-layer midnight disagreement: the editor and extractor share a
  single notion of "today" because the editor pins it via `--date`.
- The editor avoids an entire class of off-by-one-day bugs by never
  converting between local time and UTC.

Harder:

- The editor has no IANA-timezone lever: "today" is whatever the host
  clock/locale says. A user who wants the agenda anchored to a timezone
  different from the host's system timezone cannot express that through
  the extension UI today.
- The extractor's timezone capability is only reachable via standalone
  CLI use without `--date`. Invoking the CLI directly with `--tz` (and
  no `--date`) can yield a different "today" than the editor would show
  for the same instant near midnight. This is by design, not a bug, but
  is a place where the two entry points can diverge.
- DST and timezone correctness in the editor are delegated entirely to
  the host's `Date` implementation; the project carries no DST logic of
  its own and inherits the platform's behavior.

## References

- Local date helpers: `src/utils/isoDate.ts`, `parseLocalDate` in
  `src/views/agendaPanel.ts`
- "Today" and the `--date` argument: `src/commands/agenda.ts`
- CLOCK / timestamp time handling: `src/utils.ts`,
  `src/commands/timestampEdit.ts`, `src/utils/clockRounding.ts`
- Wire format (wall-clock timestamps): ADR-0003
- Extractor timezone computation: `compute_today_in_tz` and
  `current_date_override` in `src/agenda.rs` of
  [github.com/VitalyOstanin/markdown-org-extract](https://github.com/VitalyOstanin/markdown-org-extract)
- Upstream reference for Org-mode timestamps: [orgmode.org](https://orgmode.org/)
