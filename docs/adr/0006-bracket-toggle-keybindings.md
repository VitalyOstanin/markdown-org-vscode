# ADR-0006: Bracket-toggle keybindings and scope

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Companion to
[ADR-0005](0005-active-and-inactive-timestamps.md): ADR-0005 says
_what_ the active / inactive distinction is on the editor side, this
ADR says _which UX surface_ exposes it and _what is deliberately left
out_ of that surface.

## Context

ADR-0005 introduces three editor mechanisms that interact with the
bracket form:

1. **Shift+Up / Shift+Down** -- existing keybindings. On a date part
   they shift by one day; on hour/minute by one unit; on a keyword
   line they cycle `SCHEDULED → DEADLINE → CLOSED → SCHEDULED`.
2. **`markdown-org.toggleTimestampActive`** -- new command. Flips
   `<...>` ↔ `[...]` on a bare inline timestamp.
3. **Diagnostic + Quick Fix** -- surfaces keyword lines whose bracket
   form violates the policy and rewrites them on `Ctrl+.`.

Several UX questions had to be answered before shipping:

- Should Shift+Up/Down also cycle through the active / inactive
  states, the way it cycles keywords?
- Should `toggleTimestampActive` work on keyword lines (where the
  bracket form is bound to the keyword by ADR-0005)?
- Should `toggleTimestampActive` work on CLOCK timestamps?
- What's the default keybinding for `toggleTimestampActive`?

Each of these has a defensible "yes" answer in isolation; the
interactions are what forced this ADR.

## Decision

### Shift+Up/Down does not toggle the bracket form

`adjustTimestamp` keeps its current two-mode behaviour: shift the date
part under the cursor, or cycle the keyword on a keyword line. It
does not gain a third mode for bracket toggling.

Rationale:

- On keyword lines the bracket form is bound to the keyword by
  ADR-0005 (`SCHEDULED:` is always `<...>`, `CLOSED:` is always
  `[...]`). Toggling brackets without changing the keyword would
  produce a state the diagnostic immediately flags. Toggling both at
  once would silently demote `SCHEDULED:` (agenda-relevant) to
  `CLOSED:` (descriptive only), which is a destructive action behind
  a directional arrow key.
- On bare inline timestamps the existing Shift+Up/Down already has a
  natural meaning (date arithmetic). Overloading the same key with a
  mode switch needs a modifier; the natural modifier is the Ctrl/Alt
  prefix that `toggleTimestampActive` already uses if the user binds
  it.
- A new key chord here would compete with VS Code's own multi-cursor
  Shift+Alt+Up.

### `toggleTimestampActive` refuses on keyword lines

When the cursor is on a `SCHEDULED:` / `DEADLINE:` / `CLOSED:` /
`CREATED:` line, the command shows a warning naming the keyword and
the form it allows ("`SCHEDULED` allows only active `<...>` form
(ADR-0014); cycle the keyword via Shift+Up to change it.") instead of
rewriting the brackets.

Rationale: same as Shift+Up/Down -- the bracket form is bound to the
keyword. The refusal message points at the keyword cycle so the user
has a clear next step instead of an opaque "cannot perform" toast.

### CLOCK timestamps are out of scope for the toggle

Even though ADR-0003 / ADR-0005 accept both bracket forms on CLOCK
entries, `toggleTimestampActive` does not flip them.

Rationale: CLOCK entries are tracked time; flipping the bracket form
changes nothing observable (CLOCK already accepts both forms on read,
and no agenda window consumes them) but does break round-trip with
files Emacs produced. The cost of supporting it is regression risk
on `findClockLines` / `parseClockEntries`; the benefit is zero new
user-visible behaviour. Postponed until a concrete use case appears.

### No default keybinding

`markdown-org.toggleTimestampActive` is exposed via the Command
Palette only. No default keybinding is shipped.

Rationale:

- Bracket toggling on bare inline timestamps is a minority operation
  compared to date arithmetic (Shift+Up/Down) or keyword cycling
  (also Shift+Up/Down on keyword lines). Burning a default chord on
  the minority case crowds the keymap.
- The Quick Fix on `Ctrl+.` already covers the majority case (a
  keyword line with the wrong bracket).
- Users who do want a chord can add their own in `keybindings.json`;
  the command id `markdown-org.toggleTimestampActive` is stable.

### Out of scope (deferred)

- Bracket toggle on CLOCK timestamps (see above).
- A keybinding default; revisit if a survey or issue thread shows
  consistent demand.
- Symmetric behaviour with Emacs `org-toggle-timestamp-type` on
  keyword lines (rejected in ADR-0005 because Emacs's flexibility
  there breaks the editor-side agenda invariant).

## Consequences

Easier:

- The keymap stays predictable: Shift+Up/Down is date arithmetic and
  keyword cycle, full stop. New users don't need to learn a third
  meaning.
- The Quick Fix on `Ctrl+.` is the single one-keystroke path for the
  most common bracket fix (legacy keyword lines), without competing
  with the toggle command.
- The toggle command's keyword-line refusal is self-explanatory: the
  message names the keyword and the way out.

Harder:

- A user who wants to flip a bare inline `<2026-05-21 Thu>` to its
  inactive form has to go through the Command Palette or bind their
  own key. No keystroke is included in the box.
- CLOCK bracket toggling has to wait for a separate decision if it
  ever becomes useful.
- The asymmetry with Emacs (`org-toggle-timestamp-type` does flip
  keyword lines, this command does not) needs a sentence in the README
  to forestall the "why does my Org-mode reflex not work?" question.

## References

- Companion ADR: [ADR-0005: Active and inactive timestamps (editor side)](0005-active-and-inactive-timestamps.md)
- Predecessor for Shift+Up/Down semantics: [ADR-0003: Org-mode wire format for timestamps and CLOCK](0003-org-mode-wire-format.md)
- Command implementation: `src/commands/timestampEdit.ts` (`toggleTimestampActive`, `adjustTimestamp`)
- Command registration and absence of default keybinding: `src/extension.ts`, `package.json`
- Quick Fix surface: `src/diagnostics/timestampBrackets.ts`
  (`BracketPolicyCodeActionProvider`)
- Upstream contrast: Emacs `org-toggle-timestamp-type`
  (`lisp/org.el:15510`) flips keyword-line brackets in-place; this
  ADR diverges deliberately.
