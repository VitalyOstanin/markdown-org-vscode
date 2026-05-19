# ADR-0001: External Rust extractor for markdown scanning

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted.

## Context

The extension needs to scan an arbitrary workspace -- often dozens to
thousands of markdown files -- and produce structured data for the
agenda: tasks, status, priorities, timestamps (CREATED/SCHEDULED/
DEADLINE/CLOSED), CLOCK entries, file tags, holidays. The scan must be
fast enough to feel interactive on every Show Agenda command and stable
across operating systems.

Three options were on the table:

1. Parse markdown inside the extension in TypeScript on every command.
2. Spawn a Node child process running shared TypeScript code.
3. Spawn an external native binary that emits JSON.

Option 1 turns every agenda open into a synchronous walk of the
workspace inside the extension host -- known to block the editor on
large repos and to share the host's memory budget. Option 2 keeps the
parsing in the same language but still pays Node startup on every
invocation and offers no native speed advantage. Option 3 trades a
strict wire contract for the lowest per-call cost and lets other
editors reuse the same scanner.

## Decision

The extension shells out to `markdown-org-extract`, a separate Rust
binary distributed via crates.io. The contract is:

- Invocation: `markdown-org-extract --dir <ws> --format json [--agenda <mode>] [--date <iso>] [--tasks] [--holidays <year>] [--absolute-paths]`.
- Output: a JSON document on stdout that the extension parses with
  `JSON.parse`. Schemas (`AgendaData`, `Task`, etc.) live in
  `src/types.ts`.
- Failure modes: non-zero exit + stderr; the extension wraps this with
  `buildExecError` and surfaces a normalised message via `notify`.

Path resolution is governed by `markdown-org.extractorPath` and is
disabled in untrusted workspaces (`capabilities.untrustedWorkspaces`
in `package.json`).

## Consequences

Easier:

- Cold scans of large repos are much faster than a TS walk would be.
- The scanner is reusable: other editors / shells can invoke the same
  binary and get the same JSON shape.
- The extension host stays responsive even on heavy workspaces because
  parsing runs in a separate process.

Harder:

- Users must install `markdown-org-extract` separately. The README
  documents this and the extension surfaces a clear error if the
  binary is missing.
- The JSON wire format becomes a contract -- changes there require
  coordinated updates on both sides (see [ADR-0003](0003-org-mode-wire-format.md)
  for the timestamp/CLOCK piece of that contract).
- Security: the configured path is executed on every agenda. The
  README warns to point it only at trusted binaries, and untrusted
  workspaces ignore the setting (enforced by VS Code).

## References

- Contract types: `src/types.ts`
- Extractor resolution + timeouts/maxBuffer: `src/utils/extractor.ts`
- Agenda invocation: `src/commands/agenda.ts`
- User-facing setting: `markdown-org.extractorPath` in `package.json`
- Trust gate: `capabilities.untrustedWorkspaces` in `package.json`
- Binary source: [github.com/VitalyOstanin/markdown-org-extract](https://github.com/VitalyOstanin/markdown-org-extract) (published to [crates.io](https://crates.io/crates/markdown-org-extract))
