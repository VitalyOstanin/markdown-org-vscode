# Markdown Org

VS Code extension for org-style task management in Markdown files.

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

```bash
git clone https://github.com/VitalyOstanin/markdown-org-vscode.git
cd markdown-org-vscode
npm install
npm run compile
ln -s "$(pwd)" "$HOME/.vscode/extensions/markdown-org-vscode"
# Reload VS Code: Ctrl+Shift+P -> "Developer: Reload Window"
```

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

| Command                          | Hotkey            | Description                                       |
| -------------------------------- | ----------------- | ------------------------------------------------- |
| `Markdown Org: Set TODO`         | `Ctrl+K Ctrl+T`   | Mark heading as TODO                              |
| `Markdown Org: Set DONE`         | `Ctrl+K Ctrl+D`   | Mark heading as DONE                              |
| `Markdown Org: Toggle Priority`  | `Ctrl+K Ctrl+P`   | Toggle priority: none → [#A] → none               |

### Timestamp Commands

| Command                                    | Hotkey                       | Description                                                                  |
| ------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| `Markdown Org: Insert CREATED Timestamp`   | `Ctrl+K Ctrl+K Ctrl+C`       | Insert CREATED timestamp under the heading                                   |
| `Markdown Org: Insert SCHEDULED Timestamp` | `Ctrl+K Ctrl+K Ctrl+S`       | Insert SCHEDULED timestamp; repeating the command removes it (toggle off)    |
| `Markdown Org: Insert DEADLINE Timestamp`  | `Ctrl+K Ctrl+K D`            | Insert DEADLINE timestamp; repeating the command removes it (toggle off)    |
| `Markdown Org: Timestamp Up`               | `Shift+Up`                   | Increment date/time/task status/timestamp type under cursor                  |
| `Markdown Org: Timestamp Down`             | `Shift+Down`                 | Decrement date/time/task status/timestamp type under cursor                  |

### CLOCK Commands

| Command                              | Hotkey                              | Description                                              |
| ------------------------------------ | ----------------------------------- | -------------------------------------------------------- |
| `Markdown Org: Insert CLOCK Start`   | `Ctrl+K Ctrl+K Ctrl+C Ctrl+S`       | Start a new CLOCK entry (opens timer)                    |
| `Markdown Org: Insert CLOCK Finish`  | `Ctrl+K Ctrl+K Ctrl+C Ctrl+F`       | Close the open CLOCK entry and calculate its duration    |
| `Markdown Org: Insert CLOCK Table`   | `Ctrl+K Ctrl+K Ctrl+C Ctrl+V`       | Insert an aggregated CLOCK table for the current file    |

### Agenda Commands

| Command                            | Hotkey                       | Description                                                |
| ---------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| `Markdown Org: Show Agenda (Day)`  | -                            | Show today's tasks                                         |
| `Markdown Org: Show Agenda (Week)` | `Ctrl+K Ctrl+W`              | Show week's tasks                                          |
| `Markdown Org: Show Agenda (Month)`| `Ctrl+K Ctrl+M`              | Show month's tasks                                         |
| `Markdown Org: Show Tasks`         | -                            | Show all TODO tasks grouped by priority                    |
| `Markdown Org: Cycle Tag Filter`   | `Ctrl+K Ctrl+K Ctrl+T`       | Cycle the active file tag filter (e.g. ALL/WORK/PRIVATE)  |

### Heading Management Commands

| Command                              | Hotkey                              | Description                                                                |
| ------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| `Markdown Org: Move to Archive`      | `Ctrl+K Ctrl+K Ctrl+M Ctrl+A`       | Move current heading into the file's `*.archive.md`                        |
| `Markdown Org: Promote to Maintain`  | `Ctrl+K Ctrl+K Ctrl+M Ctrl+P`       | Move heading to the maintain file (requires `markdown-org.maintainFilePath`) |

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

### `markdown-org.fileTags`

**Type:** `{ name: string; pattern: string }[]`
**Default:** `[{ "name": "ALL", "pattern": "" }, { "name": "WORK", "pattern": "work" }, { "name": "PRIVATE", "pattern": "!work" }]`

File tag filters applied in agenda. `pattern` is a substring matched against the file path. Prefix with `!` to invert. Empty pattern matches files that do not match any other (non-negated) pattern. Cycle the active tag with `Cycle Tag Filter`.

### `markdown-org.currentTag`

**Type:** `string`
**Default:** `"ALL"`

Currently selected tag filter. Usually updated by `Cycle Tag Filter`.

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

```bash
npm install
npm run compile
ln -s "$(pwd)" "$HOME/.vscode/extensions/markdown-org-vscode"
```

Then reload the VS Code window.

## Development

### Requirements

- Node.js 20+ (see `.nvmrc` for the project-wide version)
- npm
- VS Code 1.85+
- For integration tests on Linux: `xvfb-run` (e.g. `apt install xvfb`)

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

On headless Linux, prefix integration tests with `xvfb-run -a`.

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
├── utils.ts                  # Shared helpers (findNearestHeading, toIsoDate, ...)
├── commands/
│   ├── taskStatus.ts         # TODO/DONE + priority + SCHEDULED/DEADLINE/CREATED
│   ├── agenda.ts             # showAgenda(...), cycleTag, extractor invocation
│   ├── clock.ts              # CLOCK start/finish
│   ├── clocktable.ts         # Insert CLOCK Table
│   ├── timestampEdit.ts      # Shift+Up/Down editing
│   └── moveHeading.ts        # Move to Archive, Promote to Maintain
├── views/
│   └── agendaPanel.ts        # Webview for agenda/tasks display
└── test/                     # Unit (*.test.ts) and integration (*.integration.test.ts)
```
