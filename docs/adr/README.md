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

| #    | Title                                                                                                                 | Status                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0001 | [External Rust extractor for markdown scanning](0001-external-rust-extractor.md)                                      | Accepted                                                  |
| 0002 | [Webview-based agenda UI](0002-webview-agenda.md)                                                                     | Accepted                                                  |
| 0003 | [Org-mode wire format for timestamps and CLOCK](0003-org-mode-wire-format.md)                                         | Accepted                                                  |
| 0004 | [Distribute via Open VSX and GitHub Releases, not Microsoft Marketplace](0004-open-vsx-distribution.md)               | Accepted                                                  |
| 0005 | [Active and inactive timestamps (editor side)](0005-active-and-inactive-timestamps.md)                                | Accepted                                                  |
| 0006 | [Bracket-toggle keybindings and scope](0006-bracket-toggle-keybindings.md)                                            | Accepted                                                  |
| 0007 | [Local wall-clock dates; timezone awareness lives in the extractor](0007-local-time-and-timezones.md)                 | Superseded by [0015](0015-pin-today-with-current-date.md) |
| 0008 | [No community meta-docs until a community exists](0008-no-community-meta-docs.md)                                     | Accepted                                                  |
| 0009 | [On-disk task properties via an org-properties fenced block](0009-task-properties-org-properties-block.md)            | Accepted                                                  |
| 0010 | [Google Calendar sync (push MVP)](0010-google-calendar-sync.md)                                                       | Accepted                                                  |
| 0011 | [Google Calendar sync: GOA token provider (Linux)](0011-google-calendar-sync-goa-provider.md)                         | Accepted                                                  |
| 0012 | [Webview client as a typed project](0012-webview-client-as-a-typed-project.md)                                        | Accepted                                                  |
| 0013 | [Agenda UI language: own setting and dictionary](0013-agenda-ui-language-own-dictionary.md)                           | Accepted (amended by 0019)                                |
| 0014 | [One agenda style, no style switcher](0014-single-agenda-style.md)                                                    | Accepted                                                  |
| 0015 | [Pin "today" with `--current-date`, not `--date`](0015-pin-today-with-current-date.md)                                | Accepted                                                  |
| 0016 | [Read the agenda's git status through the Git extension API](0016-git-status-via-git-extension-api.md)                | Accepted (amended by 0018, 0020)                          |
| 0017 | [Marking a repeating task done moves it forward](0017-repeating-tasks-move-on-done.md)                                | Accepted                                                  |
| 0018 | [Minimum VS Code version follows the Git API members we call](0018-minimum-host-follows-the-git-api.md)               | Accepted                                                  |
| 0019 | [Panel-action notifications follow the agenda UI language](0019-panel-action-notifications-follow-the-ui-language.md) | Accepted                                                  |
| 0020 | [The panel reports a merge but never resolves one](0020-panel-does-not-resolve-conflicts.md)                          | Accepted                                                  |

## Adding a new ADR

1. Copy an existing file as a starting point, increment the sequence
   number, and pick a short imperative title.
2. Fill in `Context`, `Decision`, `Consequences`. Link to the code,
   commits, or PRs that drove the decision under `References`.
3. Add a row to the [Index](#index) above.
4. Commit the ADR alongside the change it documents -- the ADR is part
   of the change, not a separate follow-up.
