# Architecture Decision Records

This directory holds the project's Architecture Decision Records (ADRs),
following the format proposed by Michael Nygard. Each ADR captures a
single architectural decision: the context that forced the choice, what
was decided, and the trade-offs that came with it.

## Table of Contents

- [Conventions](#conventions)
- [Index](#index)
- [Adding a new ADR](#adding-a-new-adr)

## Conventions

- Files are named `NNNN-kebab-case-title.md` with a four-digit
  zero-padded sequence number.
- ADRs are **immutable** once they leave `Status: Proposed`. To change a
  decision, write a new ADR that supersedes the old one and update both
  files' `Status` fields with cross-references.
- Each ADR has the sections `Status`, `Context`, `Decision`,
  `Consequences`, and (optional) `References`. Keep the body short --
  one to two screens is the target.
- The index below mirrors the directory; keep it in sync when a new ADR
  is added or an existing ADR changes status.

## Index

| #    | Title                                                                                                      | Status   |
| ---- | ---------------------------------------------------------------------------------------------------------- | -------- |
| 0001 | [External Rust extractor for markdown scanning](0001-external-rust-extractor.md)                           | Accepted |
| 0002 | [Webview-based agenda UI](0002-webview-agenda.md)                                                          | Accepted |
| 0003 | [Org-mode wire format for timestamps and CLOCK](0003-org-mode-wire-format.md)                              | Accepted |
| 0004 | [Distribute via Open VSX and GitHub Releases, not Microsoft Marketplace](0004-open-vsx-distribution.md)    | Accepted |
| 0005 | [Active and inactive timestamps (editor side)](0005-active-and-inactive-timestamps.md)                     | Accepted |
| 0006 | [Bracket-toggle keybindings and scope](0006-bracket-toggle-keybindings.md)                                 | Accepted |
| 0007 | [Local wall-clock dates; timezone awareness lives in the extractor](0007-local-time-and-timezones.md)      | Accepted |
| 0008 | [No community meta-docs until a community exists](0008-no-community-meta-docs.md)                          | Accepted |
| 0009 | [On-disk task properties via an org-properties fenced block](0009-task-properties-org-properties-block.md) | Accepted |

## Adding a new ADR

1. Copy an existing file as a starting point, increment the sequence
   number, and pick a short imperative title.
2. Fill in `Context`, `Decision`, `Consequences`. Link to the code,
   commits, or PRs that drove the decision under `References`.
3. Add a row to the [Index](#index) above.
4. Commit the ADR alongside the change it documents -- the ADR is part
   of the change, not a separate follow-up.
