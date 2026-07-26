# ADR-0014: One agenda style, no style switcher

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted

## Context

The agenda redesign first shipped as four selectable looks -- `monospace`,
`native`, `hybrid` and `table` -- chosen by `markdown-org.agendaStyle`, switched
from an in-panel menu and by a `Cycle Agenda Style` command. The renderer emitted
one semantic DOM and the stylesheet selected a preset through
`body[data-agenda-style]`.

The arrangement cost more than it returned:

- Every rendering change had to be judged against four presets, and the CSS grew
  a preset-neutral base layer that the winning preset then had to override rule
  by rule -- the `table` preset overrode or hid seven of those base rules, and
  markup and translated strings were still produced for parts no preset showed.
- Three of the four presets were never the default and, in use, were not chosen:
  `table` was the one the design work converged on.
- The presets pulled two further settings behind them
  (`agendaMonospaceFontFamily`, `agendaTableAllMono`) whose only consumer was a
  preset that no longer existed after the collapse.
- Tests and screenshots multiplied by four for a difference nobody was asking
  for.

## Decision

Keep a single agenda look -- the former `table` -- and remove the switcher:

- `markdown-org.agendaStyle`, `markdown-org.agendaMonospaceFontFamily` and
  `markdown-org.agendaTableAllMono` are gone from the manifest, as are the
  in-panel style menu and the `Cycle Agenda Style` command.
- `body[data-agenda-style]` and every selector scoped to it are gone from
  `agendaStyles.ts`; the stylesheet now states the look once. Markup that only
  a removed preset displayed was removed with it (the `todo:` label, the stacked
  time-info cell and the computation behind it, the day-header arrows).
- `markdown-org.agendaFontFamily` stays: it overrides the proportional font of
  the one remaining look.
- The look itself is held in place by unit-test invariants over the stylesheet
  rather than by a preset name: theme tokens only (no hardcoded colours), the
  `--space-*` spacing scale, and the `--radius-*` / `--font-*` scales.

## Consequences

- One look to design, test and screenshot; a rendering change is judged once.
- Users who preferred `monospace`, `native` or `hybrid` lose them, and their
  settings become inert (VS Code reports the removed keys as unknown). The
  removal is listed in the CHANGELOG.
- The webview no longer carries a style-menu component; the dropdown that
  remains in the panel is the file-tag filter, which was built on the same
  `.style-menu` markup and kept those class names.
- Should a second look ever be wanted, it comes back as a new decision -- the
  preset scaffolding is not kept "just in case", which is precisely what made
  the stylesheet hard to read.

## References

- Stylesheet and its invariants: `src/views/agendaStyles.ts`,
  `src/test/unit/agendaStyles.test.ts`
- Backlog entries that drove the collapse: [TODO.md](../../TODO.md) -- "Collapse
  to `table` as the single agenda style"
- Panel that renders it: [ADR-0002](0002-webview-agenda.md),
  [ADR-0012](0012-webview-client-as-a-typed-project.md)
