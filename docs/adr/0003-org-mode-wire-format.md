# ADR-0003: Org-mode wire format for timestamps and CLOCK

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted.

## Context

The project sits between two ecosystems: VS Code (markdown-first) and
Emacs Org-mode (the original task-management format). Users routinely
open the same files in both editors -- editing on a laptop in VS Code,
running `org-agenda` / `org-clock-report` on a workstation in Emacs.

For that to keep working, the on-disk representation of CREATED /
SCHEDULED / DEADLINE / CLOSED timestamps and CLOCK entries must be
parseable by both:

- Emacs Org-mode expects bare keywords: `SCHEDULED: <2025-12-09 Tue 14:30>`.
- VS Code's markdown renderer would otherwise treat those as plain
  paragraphs, breaking visual alignment and inline rendering.

Three rough shapes were considered:

1. Native markdown syntax (e.g. dedicated YAML front-matter or
   front-of-line metadata). Breaks Emacs.
2. HTML comments around the values. Breaks both Emacs and Markdown
   rendering ergonomics.
3. Reuse the exact Org-mode keyword + bracketed timestamp, wrapped in
   markdown inline code so it renders as a single styled token in
   either editor.

## Decision

All timestamp lines and CLOCK entries are written as Emacs Org-mode
syntax wrapped in markdown inline code:

```markdown
`CREATED: <2025-12-09 Tue 10:00>`
`SCHEDULED: <2025-12-09 Tue 14:30>`
`DEADLINE: <2025-12-12 Fri>`
`CLOSED: <2025-12-10 Wed 16:45>`
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] =>  1:30`
`CLOCK: [2025-12-09 Tue 14:00]`
```

Concretely:

- `TIMESTAMP_LINE_REGEX` (`src/orgPatterns.ts`) matches the four
  toggleable types plus the optional indent and inline-code wrapper.
- Weekday names accept both English and Russian forms (3-letter
  abbreviations or full names).
- CLOCK open/close uses square brackets, closed CLOCK appends
  ` => H:MM` to match Org-mode's `org-clock-update-time-maybe`.
- Commands always write timestamps inside backticks; reading code
  tolerates both wrapped and unwrapped variants for legacy files.

## Consequences

Easier:

- The same file can be edited in either editor: Emacs sees the
  keywords directly, VS Code renders them as inline code while
  `markdown-org-extract` parses them by regex.
- `org-agenda`, `org-clock-report`, and any other Emacs tooling that
  consumes the standard format keep working without translation.
- Indentation rules and ordering match Org-mode so files round-trip
  through Emacs without diff churn.

Harder:

- The format is now an external contract. Changing it (new keyword,
  altered weekday set, different CLOCK separator) requires updates in
  both this repo and `markdown-org-extract`, and may break Emacs
  interop -- so the bar for changes is high.
- Some users would prefer a more "markdown-native" syntax. The
  trade-off is documented here so the request can be evaluated against
  Emacs interop rather than rediscussed each time.
- VS Code's markdown linting/preview can occasionally object to long
  inline-code lines; tolerated as the cost of dual-tool support.

## References

- Pattern definitions: `src/orgPatterns.ts`
- Timestamp manipulation: `src/commands/timestampEdit.ts`,
  `src/utils/timestampParts.ts`, `src/utils/toggleTimestampType.ts`
- CLOCK manipulation: `src/commands/clock.ts`, `src/utils/findClockLines.ts`
- Extractor end of the contract: [github.com/VitalyOstanin/markdown-org-extract](https://github.com/VitalyOstanin/markdown-org-extract) (published to [crates.io](https://crates.io/crates/markdown-org-extract))
- Upstream reference for Org-mode timestamps: [orgmode.org](https://orgmode.org/)
