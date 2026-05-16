# Change Log

All notable changes to the "Markdown Org" extension will be documented in this file.

## [0.3.0] - 2026-05-17

### Added

- New setting `markdown-org.firstDayOfWeek` (`"monday"` | `"sunday"` | `"auto"`) controlling the first day of week in the month calendar. `"auto"` uses the locale's default via `Intl.Locale.weekInfo`.
- Mode switcher inside the agenda webview: Day / Week / Month / Tasks buttons in the navigation bar; the panel title updates when the active mode changes.
- Other-month cells in the month calendar are now clickable and navigate to the corresponding day.

### Changed

- **Tag filter semantics reworked.** Patterns are now matched against `path.basename(file)` instead of the full path, so `"work"` no longer accidentally matches files inside a `networking/` directory. An empty pattern always means "show everything" regardless of the tag's name (the previous special-case for the literal name `ALL` is gone). A `!`-prefixed pattern means "does not match any positive pattern in `fileTags`" — the text after `!` is only a marker and is ignored.
- `markdown-org.currentTag` is now persisted at workspace scope when a workspace is open (was: always global), so different projects can keep different active tags.
- Month calendar rendering:
    - Target month is derived from the navigation date, not from the first entry in the agenda data, so empty months and back/forward navigation render correctly.
    - Weekday headers are localized via `toLocaleDateString` instead of hardcoded English `Mon`/`Tue`/…
    - The grid now adapts to 4–6 rows depending on the month's length instead of always rendering 6 rows.
    - Tasks marked as overdue now contribute to the day's "has tasks" indicator.
- Documented tag filter semantics in [TAG_FILTERING.md](TAG_FILTERING.md) and README.

### Fixed

- Re-running `Show Agenda (Day/Week/Month)` or `Show Tasks` on an already-open agenda panel now correctly switches the mode instead of being ignored.
- Calendar no longer crashes on an empty `days[]` array.

### Internal

- Extracted the tag filter into `src/utils/tagFilter.ts` so it can be unit-tested without the `vscode` runtime.
- Added unit tests for `filterTasksByTag` covering basename matching, negation symmetry, empty-pattern semantics, unknown-tag fallback, and per-day data shape.
- Extended integration tests for `cycleTag`: workspace-scope persistence, recovery from an unknown current tag, and the empty-`fileTags` warning path.
- Removed dead static fields `AgendaPanel.currentMode` and `AgendaPanel.currentTag`; renamed `AgendaPanel.refreshWithCurrentTag()` to `refresh()`.
- Wrapped `child_process.execFile` in `src/utils/exec.ts` so it can be stubbed in tests without redefining the non-configurable `cp.execFile` descriptor in newer Node.

## [0.2.4] - 2025-12-09

### Fixed

- Release workflow: grant write permissions so the GitHub release can be published from CI.

## [0.2.3] - 2025-12-09

### Fixed

- VSIX build now pinned to Node.js 20 to match the runtime declared in `engines.node`.

## [0.2.2] - 2025-12-09

### Internal

- Release-pipeline retry; no user-visible changes.

## [0.2.1] - 2025-12-09

### Internal

- Version bump for marketplace re-publish; no user-visible changes.

## [0.2.0] - 2025-12-06

### Added

- **Tag filtering for agenda views based on filename patterns**
    - Support for pattern matching (e.g., "work")
    - Support for negation patterns (e.g., "!work")
    - Cycle through tags with keyboard shortcut (Ctrl+K Ctrl+K Ctrl+T)
    - Current tag persists between sessions
    - Tag indicator displayed in agenda navigation bar
- New settings:
    - `markdown-org.fileTags` - tag definitions with filename patterns
    - `markdown-org.currentTag` - currently active tag filter
- New command:
    - `Markdown Org: Cycle Tag Filter` (Ctrl+K Ctrl+K Ctrl+T)

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
- Configurable settings:
    - `markdown-org.extractorPath` - path to markdown-org-extract
    - `markdown-org.workspaceDir` - workspace directory to scan
    - `markdown-org.maintainFilePath` - maintain file path
    - `markdown-org.dateLocale` - locale for date formatting

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

### Dependencies

- Requires [markdown-org-extract](https://crates.io/crates/markdown-org-extract) utility
