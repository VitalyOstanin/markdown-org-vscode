# ADR-0002: Webview-based agenda UI

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted.

## Context

The agenda needs to present tasks across day/week/month/tasks modes
with rich interactions:

- Per-day headers with weekday names and holiday hints.
- Day-of-week and grid layouts (month view).
- Inline navigation buttons (Prev/Next/Today) without leaving the panel.
- Scroll memory across navigation events.
- Tag filter indicator with a single-key cycle.
- Tooltip-like inline status/priority chips per task.

VS Code's built-in surfaces have hard limits:

- **TreeView** can't render arbitrary HTML grids and doesn't expose the
  CSS/scroll control needed for the month layout.
- **QuickPick** is single-column and modal -- wrong shape for a
  multi-day view.
- **TextDocument-based** rendering would lose interactive controls and
  bind agenda formatting to markdown syntax.

A webview is the only first-party VS Code surface that allows both
custom HTML/CSS and message-based interaction with the extension host.

## Decision

The agenda renders inside a single `WebviewPanel` managed by
`AgendaPanel` (`src/views/agendaPanel.ts`). It is constructed and
torn down through `render(...) / handleDispose()` and re-uses the
same panel across mode switches (Day → Week → Month → Tasks).

Strict CSP is enforced and pinned in `CLAUDE.md`:

- `default-src 'none'`, nonce-based `style-src` and `script-src`, no
  `unsafe-inline`, no external origins.
- All task data is sanitised through `escapeHtml` (strings) or
  `sanitizeTaskLine` / `Number(...)` (numbers) before reaching HTML.
- Every `onDidReceiveMessage` field is type-checked before being passed
  to commands or filesystem APIs.

Communication with the extension host is restricted to a small set of
commands (`openTask`, `navigate`, `cycleTag`, `switchMode`).

## Consequences

Easier:

- Full control over the agenda's visual model: month grids, day
  headers, scroll memory, focus-aware keybindings.
- Reusing the same panel keeps state cheap across mode switches.
- Security boundaries are explicit and centralised in one CSP +
  one message handler.

Harder:

- Webview cost (separate process, IPC for every message) is higher
  than a plain TreeView. Acceptable because the panel is opened on
  demand and stays warm via `retainContextWhenHidden: true`.
- The CSP / escapeHtml invariant has to be re-applied for every new
  task field or message added to the panel. The rule is codified in
  `CLAUDE.md` so it doesn't drift.
- Custom HTML means the panel doesn't pick up VS Code theme tokens for
  free; styling has to use `var(--vscode-...)` tokens deliberately.

## References

- Panel implementation: `src/views/agendaPanel.ts`
- CSP / escapeHtml invariant: `CLAUDE.md` (section "Безопасность
  webview: CSP + escapeHtml")
- Agenda entry points: `src/commands/agenda.ts`
- Integration coverage: `src/test/integration/agenda.integration.test.ts`
