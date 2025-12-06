# Change Log

All notable changes to the "Markdown Org" extension will be documented in this file.

## [0.1.0] - 2025-12-06

### Added
- Task management with TODO/DONE statuses
- Priority levels support ([#A] through [#Z])
- Timestamp support (CREATED, SCHEDULED, DEADLINE, CLOSED)
- Repeating tasks with org-mode syntax (+1d, +1w, +1wd for workdays)
- Agenda views (day, week, month)
- Tasks view (all TODO tasks sorted by priority)
- Live agenda updates on file save
- File system watchers for real-time monitoring
- Timestamp navigation (increment/decrement with Shift+Up/Down)
- Task status and timestamp type cycling with Shift+Up/Down
- Archive heading command (Ctrl+K Ctrl+A)
- Promote to maintain file command (Ctrl+K Ctrl+M)
- **Tag filtering for agenda views based on filename patterns**
  - Support for pattern matching (e.g., "work")
  - Support for negation patterns (e.g., "!work")
  - Cycle through tags with keyboard shortcut
  - Current tag persists between sessions
- Configurable settings:
  - `markdown-org.extractorPath` - path to markdown-org-extract
  - `markdown-org.workspaceDir` - workspace directory to scan
  - `markdown-org.maintainFilePath` - maintain file path
  - `markdown-org.dateLocale` - locale for date formatting
  - `markdown-org.fileTags` - tag definitions with filename patterns
  - `markdown-org.currentTag` - currently active tag filter

### Commands
- `Markdown Org: Set TODO` (Ctrl+K Ctrl+T)
- `Markdown Org: Set DONE` (Ctrl+K Ctrl+D)
- `Markdown Org: Toggle Priority` (Ctrl+K Ctrl+P)
- `Markdown Org: Insert CREATED Timestamp` (Ctrl+K Ctrl+K Ctrl+C)
- `Markdown Org: Insert SCHEDULED Timestamp` (Ctrl+K Ctrl+K Ctrl+S)
- `Markdown Org: Insert DEADLINE Timestamp` (Ctrl+K Ctrl+K Ctrl+D)
- `Markdown Org: Timestamp Up` (Shift+Up)
- `Markdown Org: Timestamp Down` (Shift+Down)
- `Markdown Org: Show Agenda (Day)`
- `Markdown Org: Show Agenda (Week)` (Ctrl+K Ctrl+W)
- `Markdown Org: Show Agenda (Month)`
- `Markdown Org: Show Tasks`
- `Markdown Org: Move to Archive` (Ctrl+K Ctrl+A)
- `Markdown Org: Promote to Maintain` (Ctrl+K Ctrl+M)
- `Markdown Org: Cycle Tag Filter` (Ctrl+K Ctrl+K Ctrl+T)

### Dependencies
- Requires [markdown-org-extract](https://crates.io/crates/markdown-org-extract) utility
