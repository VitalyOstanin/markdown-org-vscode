# Markdown Org

VS Code extension for org-style task management in Markdown files.

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
- [Installation](#installation)
    - [From VSIX](#from-vsix)
    - [From Source (development symlink)](#from-source-development-symlink)
- [Development](#development)
    - [Requirements](#requirements)
    - [Build](#build)
    - [Tests](#tests)
    - [Lint and format](#lint-and-format)
    - [Debug](#debug)
    - [Project Structure](#project-structure)
    - [Additional documentation](#additional-documentation)
- [Release notes](#release-notes)
    - [Rolling back to a previous version](#rolling-back-to-a-previous-version)
- [License](#license)

## Features

Brings [Org mode](https://orgmode.org/) task management workflow to Markdown files in VS Code:

- **Task Management** - TODO/DONE statuses with priority levels ([#A])
- **Timestamps** - SCHEDULED, DEADLINE, and CREATED timestamps with date/time
- **Repeating Tasks** - Org-mode repeater syntax (+1d, +1w, +1wd for workdays)
- **CLOCK Entries** - Time tracking with start/finish entries and clock tables
- **Agenda Views** - Day, week, and month views with automatic task grouping
- **Tag Filtering** - File tag filters (e.g. WORK/PRIVATE) toggled from the agenda view
- **Live Updates** - Agenda automatically refreshes when markdown files change
- **Heading Management** - Archive completed tasks or promote to a maintain file

## Quick Start

**macOS / Linux (bash / zsh):**

```bash
git clone https://github.com/VitalyOstanin/markdown-org-vscode.git
cd markdown-org-vscode
npm install
npm run compile
ln -s "$(pwd)" "$HOME/.vscode/extensions/markdown-org-vscode"
# Reload VS Code: Ctrl+Shift+P -> "Developer: Reload Window"
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/VitalyOstanin/markdown-org-vscode.git
cd markdown-org-vscode
npm install
npm run compile
# Creating symlinks on Windows requires either Developer Mode
# (Settings > Privacy & security > For developers) or an elevated
# PowerShell session.
New-Item -ItemType SymbolicLink `
    -Path "$env:USERPROFILE\.vscode\extensions\markdown-org-vscode" `
    -Target $PWD.Path
# Reload VS Code: Ctrl+Shift+P -> "Developer: Reload Window"
```

If creating a symlink on Windows is inconvenient, build a VSIX and install it
instead -- see [Installation > From VSIX](#from-vsix).

**Prerequisites:**

- [markdown-org-extract](https://crates.io/crates/markdown-org-extract): `cargo install markdown-org-extract`

## Syntax Examples

### Task Statuses

```markdown
## TODO Task without priority

## TODO [#A] High priority task

## DONE Completed task

## Regular heading without status
```

### Timestamps

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

CLOCK entries track time spent on tasks. They can be open (running) or closed (with duration).

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

Use **Insert CLOCK Table** to produce an aggregated table of CLOCK durations for the current file.

### Priority Levels

Priority markers can use any letter A-Z:

```markdown
## TODO [#A] High priority task

## TODO [#B] Medium priority task

## TODO [#C] Low priority task
```

Tasks with priority are shown first in agenda, sorted alphabetically (A before B before C).

### Repeating Tasks

Timestamps support org-mode repeater syntax for recurring tasks:

**Standard units:**

- `+Nh` - repeat every N hours
- `+Nd` - repeat every N days
- `+Nw` - repeat every N weeks
- `+Nm` - repeat every N months
- `+Ny` - repeat every N years
- `+Nwd` - **repeat every N workdays** (skips weekends and Russian holidays)

**Repeater modifiers:**

- `+` - cumulative (strict, preserves overdue)
- `++` - catch-up (preserves day of week)
- `.+` - restart (from completion date)

**Examples:**

```markdown
## TODO Daily standup

`SCHEDULED: <2025-12-06 Fri 10:00 +1d>`

## TODO Weekly review

`SCHEDULED: <2025-12-06 Fri ++1w>`

## TODO Every 2 workdays

`SCHEDULED: <2025-12-06 Fri +2wd>`
```

## Commands

Hotkeys below match the bindings declared in `package.json`. All keybindings except `Cycle Tag Filter` are only active when an active Markdown editor has focus.

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
| `Markdown Org: Timestamp Up`               | `Shift+Up`             | Increment date/time/task status/timestamp type under cursor               |
| `Markdown Org: Timestamp Down`             | `Shift+Down`           | Decrement date/time/task status/timestamp type under cursor               |

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
| `Markdown Org: Show Agenda (Week)`  | `Ctrl+K Ctrl+W`        | Show week's tasks                                        |
| `Markdown Org: Show Agenda (Month)` | `Ctrl+K Ctrl+M`        | Show month's tasks                                       |
| `Markdown Org: Show Tasks`          | -                      | Show all TODO tasks grouped by priority                  |
| `Markdown Org: Cycle Tag Filter`    | `Ctrl+K Ctrl+K Ctrl+T` | Cycle the active file tag filter (e.g. ALL/WORK/PRIVATE) |

### Heading Management Commands

| Command                             | Hotkey                        | Description                                                                  |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `Markdown Org: Move to Archive`     | `Ctrl+K Ctrl+K Ctrl+M Ctrl+A` | Move current heading into the file's `*.archive.md`                          |
| `Markdown Org: Promote to Maintain` | `Ctrl+K Ctrl+K Ctrl+M Ctrl+P` | Move heading to the maintain file (requires `markdown-org.maintainFilePath`) |

## Settings

### `markdown-org.extractorPath`

**Type:** `string`
**Default:** `"markdown-org-extract"`

Path to the markdown-org-extract executable. By default, searches in system PATH.

```json
{
    "markdown-org.extractorPath": "markdown-org-extract"
}
```

For a custom installation location:

```json
{
    "markdown-org.extractorPath": "/custom/path/to/markdown-org-extract"
}
```

> **Security:** the configured path is executed by the extension every
> time agenda or related commands run. Always point this setting at a
> binary you trust -- ideally one installed via
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

- `""` (empty) — filter disabled; all tasks are shown. The tag's name has no special meaning.
- `"text"` — basename contains `"text"`.
- `"!..."` — basename matches **none** of the positive patterns in `fileTags`. The text after `!` is only a marker and is ignored, so `"!"`, `"!work"`, and `"!xyz"` all behave the same way.

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

This extension requires [markdown-org-extract](https://crates.io/crates/markdown-org-extract) - a Rust utility for extracting tasks from markdown files.

```bash
cargo install markdown-org-extract
```

After installation, the utility will be available at `~/.cargo/bin/markdown-org-extract`. Make sure `~/.cargo/bin` is in your PATH, or configure the full path in the `markdown-org.extractorPath` setting.

## Installation

### From VSIX

```bash
npm run package    # produces markdown-org-vscode-<version>.vsix
code --install-extension markdown-org-vscode-<version>.vsix
```

### From Source (development symlink)

**macOS / Linux:**

```bash
npm install
npm run compile
ln -s "$(pwd)" "$HOME/.vscode/extensions/markdown-org-vscode"
```

**Windows (PowerShell):**

```powershell
npm install
npm run compile
# Requires Developer Mode (Settings > Privacy & security > For developers)
# or an elevated PowerShell session.
New-Item -ItemType SymbolicLink `
    -Path "$env:USERPROFILE\.vscode\extensions\markdown-org-vscode" `
    -Target $PWD.Path
```

Then reload the VS Code window. On Windows, installing the
[VSIX](#from-vsix) instead avoids the symlink requirement.

## Development

### Requirements

- Node.js 22+ required (`engines.node` in `package.json`); CI and `.nvmrc` also use **Node 22** -- run `nvm use` to match.
- npm
- VS Code 1.85+
- For running integration tests on **headless Linux** (CI, remote machines without an X server): `xvfb-run` (e.g. `apt install xvfb`). Not required on macOS, Windows, or Linux with a graphical session.

### Build

```bash
npm install
npm run compile         # or `npm run watch` for incremental compilation
```

### Tests

```bash
npm test                # unit tests via Mocha (no VS Code host required)
npm run test:integration   # integration tests via @vscode/test-electron (downloads VS Code)
```

On headless Linux, prefix integration tests with `xvfb-run -a`. On macOS and Windows the integration runner uses the native display.

CI runs the full lint + unit + integration suite on Ubuntu, macOS, and Windows (`.github/workflows/ci.yml`). The release workflow re-runs the same matrix before packaging the VSIX.

### Lint and format

```bash
npm run lint            # ESLint (flat config, eslint.config.mjs)
npm run lint:fix
npm run format          # Prettier
npm run format:check
```

### Debug

1. Open project in VS Code
2. Press `F5` or `Run > Start Debugging`
3. A new VS Code window opens with the extension installed
4. Open any `.md` file and test commands

**Debug tips:**

- Breakpoints work in `.ts` files in `src/` folder
- Debug console shows `console.log()` output
- Press `Ctrl+Shift+F5` to restart after code changes

### Project Structure

```
src/
├── extension.ts              # Entry point, command registration
├── orgPatterns.ts            # Shared regex patterns (CLOCK, HEADING, TIMESTAMP)
├── types.ts                  # Shared types (Task, DayAgenda, FileTag, ...)
├── utils.ts                  # Top-level helpers (findNearestHeading, toIsoDate, ...)
├── utils/
│   ├── extractor.ts          # markdown-org-extract resolution + timeouts/maxBuffer
│   ├── exec.ts               # execFile wrapper (centralized for test stubbing)
│   ├── notify.ts             # Unified "Markdown Org: ..." user-facing messages
│   ├── tagFilter.ts          # File tag filter matching
│   ├── cycleTag.ts           # ALL <-> tag rotation
│   ├── blockDeletion.ts      # EOF-safe block deletion range math
│   ├── agendaClick.ts        # Click intent resolution in the agenda webview
│   ├── agendaScroll.ts       # Per-anchor scroll memory for the agenda
│   └── agendaHeadingTint.ts  # Heading class resolution (priority / DEADLINE)
├── commands/
│   ├── taskStatus.ts         # TODO/DONE + priority + SCHEDULED/DEADLINE/CREATED
│   ├── agenda.ts             # showAgenda(...), cycleTag, extractor invocation
│   ├── clock.ts              # CLOCK start/finish
│   ├── clocktable.ts         # Insert CLOCK Table
│   ├── timestampEdit.ts      # Shift+Up/Down editing
│   └── moveHeading.ts        # Move to Archive, Promote to Maintain
├── views/
│   └── agendaPanel.ts        # Webview for agenda/tasks display
└── test/
    ├── unit/                 # Mocha unit tests (*.test.ts, no VS Code host)
    ├── integration/          # @vscode/test-electron tests (*.integration.test.ts)
    └── suite/                # Mocha runners (index.ts, integration.ts)
```

### Additional documentation

Internal design notes and testing playbooks live in `docs/`; example
markdown files used by manual testing live in `examples/`:

- [`docs/adr/`](docs/adr/) -- Architecture Decision Records (why the project looks the way it does)
- [`docs/clock-implementation.md`](docs/clock-implementation.md) -- CLOCK feature design notes
- [`docs/clock-testing.md`](docs/clock-testing.md) -- manual CLOCK test plan
- [`docs/clock-usage.md`](docs/clock-usage.md) -- CLOCK end-user reference
- [`docs/holidays-integration.md`](docs/holidays-integration.md) -- how the extractor supplies holiday dates
- [`docs/month-view-changes.md`](docs/month-view-changes.md) -- month-calendar implementation notes
- [`docs/month-view-tests.md`](docs/month-view-tests.md) -- month-view test scenarios
- [`TAG_FILTERING.md`](TAG_FILTERING.md) -- user-facing tag filter reference (linked from the main flow above)
- [`TODO.md`](TODO.md) -- internal backlog
- [`examples/`](examples/) -- demo markdown files for manual smoke-testing

## Release notes

Per-version changes are tracked in [`CHANGELOG.md`](CHANGELOG.md) using the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

The version bump itself ships as a single commit whose subject follows
the form `chore(release): vX.Y.Z`. That commit updates `package.json`
(and any other version-pinning file) and adds the matching CHANGELOG
section; the annotated tag `vX.Y.Z` is then created on the same commit
to trigger the publish workflow. The Conventional Commits scope keeps
release commits easy to filter (`git log --grep '^chore(release)'`)
without claiming a behaviour change those commits never carry.

### Rolling back to a previous version

If a release introduces a regression, you can pin the extension to the
previous good build without waiting for a forward fix:

1. Open the **GitHub Releases** page and download the `.vsix` for the
   last known good version.
2. In VS Code, open the **Extensions** view, click the `...` menu next
   to the search box, choose **Install from VSIX...**, and select the
   downloaded file. VS Code will replace the current install with that
   version.
3. To stop auto-updates from pulling the broken version back in, right-
   click the extension entry and choose **Pin Version**.

After the regression is fixed in a later release, unpin the version
and let VS Code resume normal updates.

If the issue is severe enough that the broken release should not be
installed by anyone, also unpublish or yank the offending tag from the
distribution channel (GitHub Release / Marketplace) so new users don't
land on it; existing installs are still protected by the steps above.

## License

Released under the [MIT License](LICENSE) -- see the LICENSE file for the
full text. The `license` field in `package.json` carries the SPDX
identifier `MIT`.
