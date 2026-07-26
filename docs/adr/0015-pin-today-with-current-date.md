# ADR-0015: Pin "today" with `--current-date`, not `--date`

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Supersedes [ADR-0007](0007-local-time-and-timezones.md).

## Context

ADR-0007 decided that the editor works in host local time and hands its
own "today" to the extractor, so the extractor's IANA-timezone branch is
never reached under the extension. It stated the mechanism as: the
editor always passes `--date <local today>`, and in the extractor that
value **is** `current_date_override`.

That mechanism does not hold against the extractor's CLI. `--date` and
`--current-date` are two independent flags there, and its own ADR-0009
("unified date window semantics") states the split explicitly:

- `--date` is the **window anchor** for `--agenda day/week/month`;
- `--current-date` overrides **"today"** -- the reference point for the
  `overdue` / `upcoming` buckets and, since extractor 0.11.0, for the
  `timestamp_next` hint of a repeating task.

With `--current-date` absent, the extractor resolves "today" from
`--tz`, whose default is `Europe/Moscow`. So every agenda the extension
requested was bucketed against the Moscow calendar day. Measured on the
bundled 0.11.0 binary: the same task and the same `--date` yield
`timestamp_next: 2026-07-25` under `--tz Europe/Moscow` and
`2026-07-26` under `--tz Pacific/Kiritimati`, and a task that is empty in
`overdue` under Moscow appears there under Kiritimati. Passing
`--current-date` removes the dependency on `--tz` entirely.

The two flags also cannot be collapsed into one: `--date` follows the
Prev/Next/Today navigation (`shiftedToday`), so it is not "today" except
on the first open.

## Decision

**The editor passes both flags on every agenda call: `--date <anchor>`
for the window and `--current-date <host local today>` for "today".**

Everything ADR-0007 decided about the editor side stands unchanged: all
date construction is local, "today" is `toIsoDate(new Date())`, and the
midnight refresh is computed in local time. What changes is only how
that value reaches the extractor.

`--current-date` is sent for `--agenda day/week/month`. It is not sent
for `--agenda tasks`, where the extractor rejects it -- that mode has no
window and no overdue/upcoming buckets.

## Consequences

Easier:

- The agenda's notion of "today" is the host's calendar day for every
  user, not just those in `Europe/Moscow`. Overdue and upcoming buckets,
  and the repeater hint, no longer shift by a day near midnight for
  users east or west of Moscow.
- The extension no longer depends on the extractor's `--tz` default, so
  a future change to that default (its ADR-0008 "RF defaults") cannot
  move the extension's agenda.

Harder:

- The invocation now carries two date flags that look interchangeable
  and are not. An integration test asserts both are present with
  different values, so a future simplification that drops one fails
  loudly instead of silently re-introducing the Moscow default.
- The editor still has no IANA-timezone lever of its own: "today"
  remains whatever the host clock says. A user who wants the agenda
  anchored to another timezone cannot express that through the UI. This
  is unchanged from ADR-0007.

## References

- Extractor invocation: `src/commands/agenda.ts`
- Test that locks the contract: "the agenda invocation pins 'today' with
  `--current-date`" in `src/test/integration/agenda.integration.test.ts`
- Superseded decision: [ADR-0007](0007-local-time-and-timezones.md)
- Extractor flag semantics: `src/cli.rs` and ADR-0009 of
  [github.com/VitalyOstanin/markdown-org-extract](https://github.com/VitalyOstanin/markdown-org-extract)
