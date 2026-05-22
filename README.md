# Markdown Org

[![CI](https://github.com/VitalyOstanin/markdown-org-vscode/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/VitalyOstanin/markdown-org-vscode/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/VitalyOstanin/markdown-org-vscode/branch/master/graph/badge.svg)](https://codecov.io/gh/VitalyOstanin/markdown-org-vscode)
[![Open VSX](https://img.shields.io/open-vsx/v/vitalyostanin/markdown-org-vscode?label=Open%20VSX)](https://open-vsx.org/extension/vitalyostanin/markdown-org-vscode)

Org-mode style task management in Markdown -- TODO/DONE workflow,
priorities, SCHEDULED/DEADLINE timestamps, day/week/month agenda views,
and CLOCK time tracking. Everything lives in plain `.md` files, so your
tasks travel with the repository.

![Day / Week / Month agenda demo](media/demo-agenda.gif)

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Syntax Examples](#syntax-examples)
    - [Task Statuses](#task-statuses)
    - [Timestamps](#timestamps)
    - [CLOCK Entries](#clock-entries)
    - [Priority Levels](#priority-levels)
    - [Repeating Tasks](#repeating-tasks)
- [Commands](#commands)
    - [Task Status Commands](#task-status-commands)
    - [Timestamp Commands](#timestamp-commands)
    - [CLOCK Commands](#clock-commands)
    - [Agenda Commands](#agenda-commands)
    - [Heading Management Commands](#heading-management-commands)
- [Settings](#settings)
    - [`markdown-org.extractorPath`](#markdown-orgextractorpath)
    - [`markdown-org.workspaceDir`](#markdown-orgworkspacedir)
    - [`markdown-org.maintainFilePath`](#markdown-orgmaintainfilepath)
    - [`markdown-org.dateLocale`](#markdown-orgdatelocale)
    - [`markdown-org.firstDayOfWeek`](#markdown-orgfirstdayofweek)
    - [`markdown-org.fileTags`](#markdown-orgfiletags)
    - [`markdown-org.currentTag`](#markdown-orgcurrenttag)
    - [`markdown-org.clockRoundMinutes`](#markdown-orgclockroundminutes)
- [Workspace Trust](#workspace-trust)
- [Dependencies](#dependencies)
- [Development](#development)
- [Release notes](#release-notes)
- [License](#license)

## Features

Brings the [Org mode](https://orgmode.org/) task management workflow
to Markdown files in VS Code:

- **Task management** -- TODO / DONE statuses with priorities (`[#A]` -- `[#Z]` or numeric `[#0]` -- `[#64]`).
- **Timestamps** -- `CREATED`, `SCHEDULED`, `DEADLINE`, `CLOSED` with full date / time.
- **Repeating tasks** -- Org-mode repeaters `+1d`, `+1w`, `+1m`, `.+1m`, `++1w`, and `+1wd` for workdays (skips weekends and Russian holidays).
- **CLOCK entries** -- Time tracking with start / finish events and an aggregated CLOCK table per file.
- **Agenda views** -- Day, Week, and Month, with automatic grouping of overdue, scheduled, and upcoming tasks.
- **Tag filtering** -- Filter agenda by file-name patterns (e.g. `WORK` / `PRIVATE`), toggled from the agenda or by hotkey.
- **Live updates** -- Agenda refreshes automatically when underlying markdown files change.
- **Heading management** -- Archive completed tasks to `*.archive.md` or promote them to a maintenance file.

## Quick Start

The extension bundles a prebuilt `markdown-org-extract` binary inside
the VSIX, so there is nothing to install separately. Pick the install
channel that matches your editor:

- **VSCodium / Cursor / Gitpod / code-server (Open VSX registry):**

    ```bash
    code --install-extension vitalyostanin.markdown-org-vscode
    ```

    Or browse the extension page on
    [Open VSX](https://open-vsx.org/extension/vitalyostanin/markdown-org-vscode).

- **VS Code (Microsoft Marketplace is intentionally not used -- see
  [ADR-0004](docs/adr/0004-open-vsx-distribution.md)):** download the
  platform-specific `markdown-org-vscode-X.Y.Z-<platform>.vsix` from
  [GitHub Releases](https://github.com/VitalyOstanin/markdown-org-vscode/releases)
  (e.g. `linux-x64`, `darwin-arm64`, `win32-x64`) and install it:
    - **GUI:** open the **Extensions** view (`Ctrl+Shift+X`), click the
      `...` menu next to the search box, choose **Install from VSIX...**,
      and select the downloaded file.
    - **CLI:**

        ```bash
        code --install-extension markdown-org-vscode-X.Y.Z-<platform>.vsix
        ```

Open any `.md` file in your workspace and start using the
[commands](#commands). For building the extension from source or
running with a custom `markdown-org-extract` build, see
[DEVELOPMENT.md](DEVELOPMENT.md) and
[`markdown-org.extractorPath`](#markdown-orgextractorpath).

## Syntax Examples

The extension reads tasks directly from your Markdown -- headings
become tasks, inline code spans hold timestamps:

![Editor view of a planning file](media/editor-markdown.png)

### Task Statuses

![TODO / priority / DONE workflow](media/demo-task-status.gif)

```markdown
## TODO Task without priority

## TODO [#A] High priority task

## DONE Completed task

## Regular heading without status
```

### Timestamps

![All four timestamp types and three repeater flavours](media/demo-timestamps.gif)

**With tasks:**

```markdown
## TODO [#A] Important meeting
`CREATED: <2025-12-01 Sun 09:15>`
`DEADLINE: <2025-12-06 Fri 15:00>`
```

**Completed task:**

```markdown
## DONE Fix bug in parser
`CREATED: <2025-12-01 Sun 10:00>`
`CLOSED: <2025-12-03 Tue 14:30>`
```

**Without tasks (standalone timestamps):**

```markdown
## Project planning session
`SCHEDULED: <2025-12-10 Tue 10:00>`

## Report submission
`DEADLINE: <2025-12-15 Sun>`
```

### CLOCK Entries

CLOCK entries track time spent on tasks. They can be open (running)
or closed (with duration).

![CLOCK history, new entry, and clocktable](media/demo-clock.gif)

**Open CLOCK (running):**

```markdown
## TODO Working on feature
`CREATED: <2025-12-09 Tue 10:00>`
`CLOCK: [2025-12-09 Tue 14:30]`
```

**Closed CLOCK (with duration):**

```markdown
## TODO Code review
`CREATED: <2025-12-09 Tue 09:00>`
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] =>  1:30`
`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 16:00] =>  2:00`
```

Use **Insert CLOCK Table** to produce an aggregated table of CLOCK
durations for the current file:

![Aggregated CLOCK table](media/clocktable.png)

### Priority Levels

Priority markers can be either a letter `A` -- `Z` or a number
`0` -- `64`:

```markdown
## TODO [#A] High priority task

## TODO [#B] Medium priority task

## TODO [#C] Low priority task

## TODO [#0] Highest numeric priority

## TODO [#64] Lowest numeric priority
```

Tasks with priority are shown first in the agenda, sorted ascending
(A before B before C; 0 before 1 before 2).

### Repeating Tasks

Timestamps support Org-mode repeater syntax for recurring tasks. The
weekday and repeater always live **inside** the angle brackets.

**Standard units:**

| Repeater | Meaning                                             |
| -------- | --------------------------------------------------- |
| `+Nh`    | Every N hours                                       |
| `+Nd`    | Every N days                                        |
| `+Nw`    | Every N weeks                                       |
| `+Nm`    | Every N months                                      |
| `+Ny`    | Every N years                                       |
| `+Nwd`   | Every N **workdays** (skips weekends + RU holidays) |

**Repeater modifiers:**

| Prefix | Behaviour                                |
| ------ | ---------------------------------------- |
| `+`    | Cumulative (strict) -- preserves overdue |
| `++`   | Catch-up -- preserves day of week        |
| `.+`   | Restart -- counts from completion date   |

**Examples:**

```markdown
## TODO Daily standup
`SCHEDULED: <2026-12-06 Sun 10:00 +1d>`

## TODO Weekly review
`SCHEDULED: <2026-12-06 Sun ++1w>`

## TODO Every 2 workdays
`SCHEDULED: <2026-12-06 Sun +2wd>`
```

## Commands

Hotkeys below match the bindings declared in `package.json`. All
keybindings except `Cycle Tag Filter` are only active when an active
Markdown editor has focus.

### Task Status Commands

| Command                         | Hotkey          | Description                         |
| ------------------------------- | --------------- | ----------------------------------- |
| `Markdown Org: Set TODO`        | `Ctrl+K Ctrl+T` | Mark heading as TODO                |
| `Markdown Org: Set DONE`        | `Ctrl+K Ctrl+D` | Mark heading as DONE                |
| `Markdown Org: Toggle Priority` | `Ctrl+K Ctrl+P` | Toggle priority: none → [#A] → none |

### Timestamp Commands

| Command                                    | Hotkey                 | Description                                                               |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------- |
| `Markdown Org: Insert CREATED Timestamp`   | `Ctrl+K Ctrl+K Ctrl+C` | Insert CREATED timestamp under the heading                                |
| `Markdown Org: Insert SCHEDULED Timestamp` | `Ctrl+K Ctrl+K Ctrl+S` | Insert SCHEDULED timestamp; repeating the command removes it (toggle off) |
| `Markdown Org: Insert DEADLINE Timestamp`  | `Ctrl+K Ctrl+K D`      | Insert DEADLINE timestamp; repeating the command removes it (toggle off)  |
| `Markdown Org: Timestamp Up`               | `Shift+Up`             | Increment date / time / task status / timestamp type under cursor         |
| `Markdown Org: Timestamp Down`             | `Shift+Down`           | Decrement date / time / task status / timestamp type under cursor         |

### CLOCK Commands

| Command                             | Hotkey                        | Description                                           |
| ----------------------------------- | ----------------------------- | ----------------------------------------------------- |
| `Markdown Org: Insert CLOCK Start`  | `Ctrl+K Ctrl+K Ctrl+C Ctrl+S` | Start a new CLOCK entry (opens timer)                 |
| `Markdown Org: Insert CLOCK Finish` | `Ctrl+K Ctrl+K Ctrl+C Ctrl+F` | Close the open CLOCK entry and calculate its duration |
| `Markdown Org: Insert CLOCK Table`  | `Ctrl+K Ctrl+K Ctrl+C Ctrl+V` | Insert an aggregated CLOCK table for the current file |

### Agenda Commands

| Command                             | Hotkey                 | Description                                              |
| ----------------------------------- | ---------------------- | -------------------------------------------------------- |
| `Markdown Org: Show Agenda (Day)`   | -                      | Show today's tasks                                       |
| `Markdown Org: Show Agenda (Week)`  | `Ctrl+K Ctrl+W`        | Show this week's tasks                                   |
| `Markdown Org: Show Agenda (Month)` | `Ctrl+K Ctrl+M`        | Show this month's tasks                                  |
| `Markdown Org: Show Tasks`          | -                      | Show all TODO tasks grouped by priority                  |
| `Markdown Org: Cycle Tag Filter`    | `Ctrl+K Ctrl+K Ctrl+T` | Cycle the active file tag filter (e.g. ALL/WORK/PRIVATE) |

**Day view:**

![Agenda day view](media/agenda-day.png)

**Week view:**

![Agenda week view](media/agenda-week.png)

**Month view:**

![Agenda month view](media/agenda-month.png)

### Heading Management Commands

| Command                             | Hotkey                        | Description                                                                  |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `Markdown Org: Move to Archive`     | `Ctrl+K Ctrl+K Ctrl+M Ctrl+A` | Move current heading into the file's `*.archive.md`                          |
| `Markdown Org: Promote to Maintain` | `Ctrl+K Ctrl+K Ctrl+M Ctrl+P` | Move heading to the maintain file (requires `markdown-org.maintainFilePath`) |

## Settings

### `markdown-org.extractorPath`

**Type:** `string`
**Default:** `""` (use bundled binary)

Path to the markdown-org-extract executable.

- **Empty (default):** the extension uses the binary bundled inside the
  VSIX (`bin/markdown-org-extract[.exe]`). Falls back to looking up
  `markdown-org-extract` in `PATH` if the bundled file is missing
  (e.g. during local development without a prepared `bin/`).
- **Custom value:** overrides the bundled binary. Useful when
  contributing to markdown-org-extract or running with local patches.

```json
{
    "markdown-org.extractorPath": "/path/to/my/markdown-org-extract"
}
```

> **Security:** the configured path is executed by the extension every
> time agenda or related commands run. Only override the bundled
> binary with one you trust -- ideally installed via
> `cargo install markdown-org-extract` from
> [crates.io](https://crates.io/crates/markdown-org-extract), or built
> from a source tree you control. Do not point it at downloaded
> executables of unknown origin, files in world-writable locations
> (`/tmp`, shared caches), or scripts that wrap the extractor with
> extra side effects. In untrusted workspaces VS Code automatically
> refuses to honour this setting (see `capabilities.untrustedWorkspaces`
> in `package.json`).

### `markdown-org.workspaceDir`

**Type:** `string`
**Default:** `""` (workspace root)

Directory to scan for markdown files. Empty value uses workspace root.

### `markdown-org.maintainFilePath`

**Type:** `string`
**Default:** `""` (disabled)

Path to the maintain file for the "Promote to Maintain" command. Relative paths are resolved against the workspace root; the path must stay inside the workspace.

```json
{
    "markdown-org.maintainFilePath": "docs/maintain.md"
}
```

### `markdown-org.dateLocale`

**Type:** `string`
**Default:** `"en-US"`

Locale for date formatting in agenda views.

```json
{
    "markdown-org.dateLocale": "ru-RU"
}
```

### `markdown-org.firstDayOfWeek`

**Type:** `"monday" | "sunday" | "auto"`
**Default:** `"monday"`

First day of week in the month calendar. `"auto"` resolves the first day from the locale via `Intl.Locale.weekInfo`, falling back to `"monday"` when the API is unavailable.

```json
{
    "markdown-org.firstDayOfWeek": "auto"
}
```

### `markdown-org.fileTags`

**Type:** `{ name: string; pattern: string }[]`
**Default:** `[{ "name": "ALL", "pattern": "" }, { "name": "WORK", "pattern": "work" }, { "name": "PRIVATE", "pattern": "!work" }]`

File tag filters applied in agenda. `pattern` is a case-sensitive substring matched against the file's **basename** (not the full path), so a pattern like `"work"` does not accidentally match files inside a `networking/` directory.

- `""` (empty) -- filter disabled; all tasks are shown. The tag's name has no special meaning.
- `"text"` -- basename contains `"text"`.
- `"!..."` -- basename matches **none** of the positive patterns in `fileTags`. The text after `!` is only a marker and is ignored, so `"!"`, `"!work"`, and `"!xyz"` all behave the same way.

See [TAG_FILTERING.md](TAG_FILTERING.md) for examples. Cycle the active tag with `Cycle Tag Filter`.

### `markdown-org.currentTag`

**Type:** `string`
**Default:** `"ALL"`

Currently selected tag filter. Usually updated by `Cycle Tag Filter`. Stored at workspace scope when a workspace is open, otherwise globally.

### `markdown-org.clockRoundMinutes`

**Type:** `number`
**Default:** `undefined` (no rounding)

Round CLOCK timestamps to the specified number of minutes. Start time rounds down, finish time rounds up to keep duration non-zero.

## Workspace Trust

The extension is **limited in untrusted workspaces**. The following commands are disabled because they read configured executable/file paths: `Show Agenda*`, `Show Tasks`, `Cycle Tag Filter`, `Insert CLOCK Table`, `Move to Archive`, `Promote to Maintain`.

## Dependencies

The extension delegates markdown parsing to
[`markdown-org-extract`](https://crates.io/crates/markdown-org-extract) --
a Rust utility that scans `.md` files for headings, timestamps, and
CLOCK entries. The compiled binary for your platform is shipped inside
the VSIX, so there is nothing to install separately.

If you want to use a custom build (e.g. you are contributing to
markdown-org-extract or running with local patches), point
[`markdown-org.extractorPath`](#markdown-orgextractorpath) at your
binary. The setting is also useful in untrusted workspaces where the
bundled binary is disabled until you trust the workspace.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for build, test, debug, project
layout and release process.

## Release notes

Per-version changes are tracked in [`CHANGELOG.md`](CHANGELOG.md) using
the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## License

Released under the [MIT License](LICENSE) -- see the LICENSE file for the
full text. The `license` field in `package.json` carries the SPDX
identifier `MIT`.
