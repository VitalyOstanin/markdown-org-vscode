# ADR-0009: On-disk task properties via an org-properties fenced block

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Departs from [ADR-0003](0003-org-mode-wire-format.md): timestamps
and CLOCK use Org-mode keywords wrapped in markdown inline code; task
properties instead use a fenced code block (info string `org-properties`).
Mirrors the producer-side `markdown-org-extract` ADR-0020.

## Context

Tasks need to carry structured per-task metadata on disk. The immediate
driver is an optional Google Calendar sync (a separate, later change) that
must persist a calendar event id -- and later an ETag -- against the task,
so the task can be matched to its event across runs. A general per-task
properties mechanism is introduced rather than a single-purpose hidden
field.

The extractor parses this block and emits a `properties` object per task in
its JSON (extractor ADR-0020); the extension reads that field. The
extension also needs to write/update the block on disk when syncing.

The inline-code shape used for timestamps (ADR-0003) does not fit a
multi-line key/value set: it would require per-line backticked properties
and disambiguation against planning lines. A fenced code block is a single
foldable unit, is kept out of the parsed task body by the extractor, and
folds natively in VS Code (no FoldingRangeProvider needed).

## Decision

A task's properties live in a fenced code block whose info string is
exactly `org-properties`, holding bare `KEY: value` lines, placed under the
heading and its planning lines:

    ### TODO Ship release
    `SCHEDULED: <2026-06-01 Mon 10:00>`
    ```org-properties
    GCAL_EVENT_ID: abc123/primary
    ```

- **Read**: the `properties` object arrives in the extractor JSON
  (`Task.properties`, optional).
- **Write**: a pure, vscode-free helper (`src/utils/orgProperties.ts`)
  builds and upserts the block in document text -- inserting it after the
  planning-line run when absent (the same insertion point used for
  timestamps in `src/commands/taskStatus.ts`), replacing it in place when
  present. Keys are written sorted for stable diffs. Updating is idempotent.
- **Editor binding and trigger**: the `WorkspaceEdit` glue, a command, and
  any sync trigger are intentionally deferred to the Google Calendar sync
  change that consumes this helper; this ADR covers only the on-disk format
  and the writer core.
- **Folding**: native for fenced blocks; no FoldingRangeProvider is added.

## Consequences

Easier:

- Structured metadata travels with the task and round-trips through
  markdown viewers as a folded block.
- The future calendar sync has a tested, pure core for reading/writing the
  block, independent of the editor API.

Harder:

- The on-disk format now has two shapes: inline code for timestamps/CLOCK
  (ADR-0003) and a fenced block for properties (this ADR). The divergence
  is documented so it is a deliberate choice, not drift.

## References

- Writer core: `src/utils/orgProperties.ts`.
- Type: `src/types.ts` (`Task.properties`).
- Insertion-point precedent: `src/commands/taskStatus.ts`
  (`insertOrReplaceTimestamp`).
- Departs from: [ADR-0003](0003-org-mode-wire-format.md) (inline-code wire
  format for timestamps/CLOCK).
- Producer side: `markdown-org-extract` ADR-0020.
