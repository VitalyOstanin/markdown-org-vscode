# ADR-0005: Active and inactive timestamps (editor side)

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Mirrors
[extractor ADR-0014](https://github.com/VitalyOstanin/markdown-org-extract/blob/master/docs/adr/0014-active-and-inactive-timestamps.md)
for the editor side of the contract. Amends
[ADR-0003](0003-org-mode-wire-format.md) by replacing the implicit
"all keywords use `<...>`" stance with the per-keyword policy below;
ADR-0003 itself remains the source of truth for the inline-code
wrapper and the round-trip-with-Emacs goal.

## Context

The extractor recognises two bracket forms for timestamps per its
ADR-0014:

- **Active** `<2026-05-21 Thu>` -- drives agenda and scheduling.
- **Inactive** `[2026-05-21 Thu]` -- descriptive metadata, never feeds
  the agenda.

Until 0.5.x the editor emitted only `<...>` for every keyword and
parsed only that form. With extractor 0.5.0 the on-disk contract
changes: `SCHEDULED:` and `DEADLINE:` keep `<...>`, while `CLOSED:`
and `CREATED:` switch to `[...]`; CLOCK and bare inline keep accepting
both forms. The editor has to follow:

- Insert commands must emit the form the extractor now expects, or
  the agenda silently drops freshly inserted CREATED entries.
- Edit commands must preserve the bracket form of whatever the user
  (or Emacs) wrote, so files round-trip without diff churn.
- The user needs feedback when a stored file violates the policy --
  silently rewriting on save is too aggressive, silently ignoring it
  defeats the agenda invariant. The middle ground is to surface a
  diagnostic with a one-click Quick Fix.

## Decision

### Per-keyword bracket policy

Identical to extractor ADR-0014. Restated here so the editor-side
contract is self-contained:

| Context      | Active `<...>` | Inactive `[...]` | Emitted by                                                      |
| ------------ | -------------- | ---------------- | --------------------------------------------------------------- |
| `SCHEDULED:` | yes            | no               | `insertScheduledTimestamp` (`src/commands/taskStatus.ts`)       |
| `DEADLINE:`  | yes            | no               | `insertDeadlineTimestamp` (`src/commands/taskStatus.ts`)        |
| `CLOSED:`    | no             | yes              | `setTaskStatus('DONE')` (`src/commands/taskStatus.ts`)          |
| `CREATED:`   | no             | yes              | `insertCreatedTimestamp` (`src/commands/taskStatus.ts`)         |
| Inline plain | yes            | yes              | manual entry; preserved by `timestampUp`/`timestampDown` and by |
|              |                |                  | `toggleTimestampActive` (`src/commands/timestampEdit.ts`)       |
| `CLOCK:`     | yes            | yes              | already accepted per [ADR-0003](0003-org-mode-wire-format.md)   |

`TIMESTAMP_LINE_REGEX` (`src/orgPatterns.ts`) implements the strict
form: it only matches a keyword line when the bracket form satisfies
the row above. `matchTimestampLine` is the helper consumers use.

### Mixed bracket pairs are rejected

A keyword line containing `<...]` or `[...>` does not match
`TIMESTAMP_LINE_REGEX` and is reported as a bracket-policy violation
(see Diagnostics below). The decision follows extractor ADR-0014; the
matching upstream reference is Emacs `org-toggle-timestamp-type`
(`lisp/org.el:15510`).

### Diagnostics and Quick Fix

A new diagnostic source `markdown-org` (code `bracket-policy`,
severity Warning) surfaces every keyword line whose bracket form
violates the policy or whose pair is mixed. The implementation is
split for testability:

- `src/diagnostics/bracketPolicy.ts` -- pure validator
  (`validateLines(lines: string[]): BracketViolation[]`). No vscode
  dependency, fully covered by unit tests.
- `src/diagnostics/timestampBrackets.ts` -- vscode adapter:
  `DiagnosticCollection` + `CodeActionProvider` registered via
  `registerBracketDiagnostics(context)` in `activate`.

The Quick Fix replaces the offending opening and closing brackets
with the canonical pair for the keyword and marks itself
`isPreferred = true` so `Ctrl+.` applies it without a sub-menu. The
fix never touches the timestamp's inner text, so weekday, time, and
repeater fields round-trip verbatim.

### Toggle command for bare inline timestamps

`markdown-org.toggleTimestampActive` flips `<...>` ↔ `[...]` for a
bare inline timestamp under the cursor. On a keyword line it refuses
with a keyword-named message ("`SCHEDULED` allows only active `<...>`
form (ADR-0014); cycle the keyword via Shift+Up to change it.")
because the keyword binds the bracket form; switching the bracket
would require switching the keyword too, which is exactly what
Shift+Up already does. CLOCK lines are out of scope for the toggle
in this iteration; see [ADR-0006](0006-bracket-toggle-keybindings.md).

### Insert and migration semantics

- `insertCreatedTimestamp` writes `[YYYY-MM-DD Dayname HH:MM]`.
- `setTaskStatus('DONE')` writes `CLOSED: [YYYY-MM-DD Dayname HH:MM]`
  for newly closed tasks. Re-opening (TODO from DONE) removes the
  `CLOSED:` line as before.
- Existing files with `CREATED: <...>` or `CLOSED: <...>` get a
  diagnostic + Quick Fix on first open in the editor; no automatic
  bulk rewrite is performed. The release CHANGELOG documents the
  matching `sed` recipe shared with extractor 0.5.0.

### Out of scope

- Moving `CREATED:` into a `:PROPERTIES:` drawer (still treated as a
  top-level line, matching extractor ADR-0014's same exclusion).
- Bracket toggle on CLOCK timestamps (separate decision in
  [ADR-0006](0006-bracket-toggle-keybindings.md)).
- Bracket toggle bound to Shift+Up/Down (rejected in
  [ADR-0006](0006-bracket-toggle-keybindings.md)).

## Consequences

Easier:

- Insert commands and the agenda use the same bracket form the
  extractor expects, so the agenda invariant ("inactive timestamps
  never drive agenda windows") holds end-to-end without a separate
  filter in the editor.
- Files round-trip through Emacs `C-c C-t` (closes with `CLOSED:
[...]`) and `C-c !` (writes `CREATED: [...]` per `org-expiry`)
  without bracket churn.
- The Quick Fix gives the user a single-keystroke migration for legacy
  files without forcing a destructive on-save rewrite.

Harder:

- Files produced by earlier versions of the editor with `CLOSED: <...>`
  or `CREATED: <...>` raise warnings on open. The Quick Fix is one
  keystroke per line, but a user with hundreds of legacy lines will
  prefer the bulk `sed` from CHANGELOG.
- The strict regex makes "almost-valid" inputs (mixed pair, wrong
  bracket) fail with a diagnostic rather than degrade gracefully. The
  alternative -- accepting either form on read and rewriting on write
  -- was rejected because it hides the underlying mismatch and breaks
  the round-trip guarantee with Emacs.
- The toggle command's refusal on keyword lines is asymmetric with
  Emacs (`org-toggle-timestamp-type` does flip them in-place). The
  asymmetry is intentional: Emacs lets you produce `SCHEDULED: [...]`,
  which the extractor would then ignore. Refusing here keeps the
  agenda invariant local to the editor.

## References

- Mirrored decision: [extractor ADR-0014](https://github.com/VitalyOstanin/markdown-org-extract/blob/master/docs/adr/0014-active-and-inactive-timestamps.md)
- Amended ADR: [ADR-0003: Org-mode wire format for timestamps and CLOCK](0003-org-mode-wire-format.md)
- UX follow-up for keybindings and scope: [ADR-0006: Bracket-toggle keybindings and scope](0006-bracket-toggle-keybindings.md)
- Editor code affected:
    - `src/orgPatterns.ts` -- strict `TIMESTAMP_LINE_REGEX` and `matchTimestampLine`
    - `src/utils/timestampParts.ts` -- inline-timestamp regex (both forms, paired)
    - `src/utils/toggleTimestampType.ts` -- `cycleTimestampKeyword`, `normaliseBracket`
    - `src/commands/taskStatus.ts` -- insert commands emit canonical brackets
    - `src/commands/timestampEdit.ts` -- `toggleTimestampActive`
    - `src/diagnostics/bracketPolicy.ts` -- pure validator
    - `src/diagnostics/timestampBrackets.ts` -- vscode diagnostic + Quick Fix
- Upstream Emacs Org-mode references (cited via extractor ADR-0014):
    - `org-ts-regexp` -- `lisp/org.el:425`
    - `org-ts-regexp-inactive` -- `lisp/org.el:428`
    - `org-deadline-time-regexp` -- `lisp/org.el:547`
    - `org-scheduled-time-regexp` -- `lisp/org.el:563`
    - `org-closed-time-regexp` -- `lisp/org.el:572`
    - `org-toggle-timestamp-type` -- `lisp/org.el:15510`
- Schema-evolution coordination: [extractor ADR-0015](https://github.com/VitalyOstanin/markdown-org-extract/blob/master/docs/adr/0015-json-schema-evolution.md)
  (`x-markdown-org.extractorVersion` is the coordination pin).
