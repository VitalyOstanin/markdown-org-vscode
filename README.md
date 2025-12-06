# Markdown Org

VS Code extension for org-style task management in Markdown files.

## Features

Brings [Org mode](https://orgmode.org/) task management workflow to Markdown files in VS Code:

- **Task Management** - TODO/DONE statuses with priority levels ([#A])
- **Timestamps** - SCHEDULED, DEADLINE, and CREATED timestamps with date/time
- **Agenda Views** - Day, week, and month views with automatic task grouping
- **Live Updates** - Agenda automatically refreshes when markdown files are saved
- **File Watchers** - Real-time monitoring of workspace changes
- **Timestamp Navigation** - Increment/decrement dates and times with keyboard shortcuts
- **Heading Management** - Archive completed tasks or promote to maintain file
- **Portable** - Configurable paths and locale settings for any environment

## Quick Start

```bash
# Clone repository
git clone https://github.com/VitalyOstanin/markdown-org-vscode.git
cd markdown-org-vscode

# Install dependencies
npm install

# Compile
npm run compile

# Create symlink to VS Code extensions directory
ln -s $(pwd) ~/.vscode/extensions/markdown-org-vscode

# Reload VS Code window (Ctrl+Shift+P -> "Developer: Reload Window")
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

**Creation timestamp:**
```markdown
## TODO Review documentation
`CREATED: <2025-12-01 Sun 09:15>`
`SCHEDULED: <2025-12-06 Fri>`
```

### Priority Levels

- `[#A]` - High priority (shown first in agenda)
- No priority marker - Normal priority

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

### Task Status Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| `Markdown Org: Set TODO` | `Ctrl+K Ctrl+T` | Mark heading as TODO |
| `Markdown Org: Set DONE` | `Ctrl+K Ctrl+D` | Mark heading as DONE |
| `Markdown Org: Toggle Priority` | `Ctrl+K Ctrl+P` | Toggle priority: none → [#A] → none |

### Timestamp Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| `Markdown Org: Insert CREATED Timestamp` | `Ctrl+K Ctrl+K Ctrl+C` | Insert CREATED timestamp at cursor |
| `Markdown Org: Insert SCHEDULED Timestamp` | `Ctrl+K Ctrl+K Ctrl+S` | Insert/toggle SCHEDULED timestamp (replaces DEADLINE if present) |
| `Markdown Org: Insert DEADLINE Timestamp` | `Ctrl+K Ctrl+K Ctrl+D` | Insert/toggle DEADLINE timestamp (replaces SCHEDULED if present) |
| `Markdown Org: Timestamp Up` | `Shift+Up` | Increment date/time/task status/timestamp type under cursor |
| `Markdown Org: Timestamp Down` | `Shift+Down` | Decrement date/time/task status/timestamp type under cursor |

### Agenda Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| `Markdown Org: Show Agenda (Day)` | - | Show today's tasks |
| `Markdown Org: Show Agenda (Week)` | `Ctrl+K Ctrl+W` | Show week's tasks |
| `Markdown Org: Show Agenda (Month)` | - | Show month's tasks |
| `Markdown Org: Show Tasks` | - | Show all TODO tasks by priority |

### Heading Management Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| `Markdown Org: Move to Archive` | `Ctrl+K Ctrl+A` | Move current heading to archive section |
| `Markdown Org: Promote to Maintain` | `Ctrl+K Ctrl+M` | Move heading to maintain file (requires `maintainFilePath` setting) |

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

For custom installation location:
```json
{
  "markdown-org.extractorPath": "/custom/path/to/markdown-org-extract"
}
```

### `markdown-org.workspaceDir`

**Type:** `string`  
**Default:** `""` (workspace root)

Directory to scan for markdown files. Empty value uses workspace root.

```json
{
  "markdown-org.workspaceDir": "/path/to/notes"
}
```

### `markdown-org.maintainFilePath`

**Type:** `string`  
**Default:** `""` (disabled)

Path to the maintain file for the "Promote to Maintain" command. When empty, the command is disabled.

```json
{
  "markdown-org.maintainFilePath": "/path/to/maintain.md"
}
```

**Note:** The "Promote to Maintain" command requires this setting to be configured. It moves the current heading (with all its content) to the specified file.

### `markdown-org.dateLocale`

**Type:** `string`  
**Default:** `"en-US"`

Locale for date formatting in agenda views.

**Examples:**
- `"en-US"` - English (United States): "Saturday, December 6 2025"
- `"ru-RU"` - Russian: "суббота, 6 декабря 2025"

```json
{
  "markdown-org.dateLocale": "ru-RU"
}
```

## Dependencies

This extension requires [markdown-org-extract](https://crates.io/crates/markdown-org-extract) - a Rust utility for extracting tasks from markdown files.

### Installation

```bash
cargo install markdown-org-extract
```

After installation, the utility will be available at `~/.cargo/bin/markdown-org-extract`. Make sure `~/.cargo/bin` is in your PATH, or configure the full path in `markdown-org.extractorPath` setting.

## Development

### Requirements

- Node.js 18+
- npm
- VS Code

### Build

```bash
npm install
npm run compile
```

Or watch mode for automatic recompilation:

```bash
npm run watch
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
├── commands/
│   ├── taskStatus.ts         # TODO/DONE commands
│   ├── agenda.ts             # Agenda/Tasks commands
│   ├── timestamps.ts         # Timestamp commands
│   └── moveHeading.ts        # Archive/Promote commands
└── views/
    └── agendaPanel.ts        # WebView for agenda display
```

## Installation

### From Source (VSIX)

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension markdown-org-vscode-0.1.0.vsix
```

### For Development (Symlink)

```bash
ln -s $(pwd) ~/.vscode/extensions/markdown-org-vscode
```

Then reload VS Code window.
