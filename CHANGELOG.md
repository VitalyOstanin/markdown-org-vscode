# Change Log

All notable changes to the "Markdown Org" extension will be documented in this file.

## [0.4.2] - 2026-05-19

### Internal

- Migrated the integration test bootstrap from a hand-rolled runner (`src/test/runTest.ts` + `src/test/suite/index.ts` + `src/test/suite/integration.ts`) to the official `@vscode/test-cli` and its declarative `.vscode-test.mjs` config. Behaviour is unchanged for end users; the change is purely about how tests are executed during development and in CI.
- Integration test runs now also emit a coverage report (`./coverage/integration/lcov.info`, V8 native coverage remapped through TypeScript source maps). The CI coverage job uploads it to Codecov alongside the unit report with `flags=integration`, so Codecov shows separate unit/integration coverage trends.
- Unit tests continue to use plain Mocha via `.mocharc.unit.json`, so the unit feedback loop (`npm test`, `npm run test:watch`, `npm run test:coverage`) is unchanged.
- `scripts/run-integration-tests.js` now wraps `vscode-test` (instead of the deleted `runTest.js`) in `xvfb-run` when available on Linux, preserving the rule that integration tests never hijack the developer's real display.
- Removed unused devDependencies `glob` and `@types/glob` (only consumed by the deleted Mocha loader). `@vscode/test-cli` brings its own glob transitively.

## [0.4.1] - 2026-05-19

### Internal

- Hardened the release/CI surface end-to-end against a long-form project-check review (100+ findings, all closed):
    - Annotated tags are now required for publish, the GitHub Release body is populated from `CHANGELOG.md`, and a VSIX smoke-test runs in the release workflow before the artifact is uploaded.
    - `.vscodeignore` now drops test runtime artifacts (`coverage/`, `.husky/`, `.c8rc.json`) so they cannot leak into the Marketplace VSIX.
    - macOS and Windows CI runners pinned to fixed images (`macos-15`, `windows-2025`, `ubuntu-24.04`); a weekly scheduled `npm audit` job and a Dependabot group for `github-actions` updates were added.
- Reworked the integration-test runner: `npm run test:integration` now auto-wraps the VS Code Extension Host with `xvfb-run` on Linux when available, so tests no longer hijack the user's display. A new `npm run test:watch` script pairs the TypeScript watcher with a Mocha watcher for unit-test feedback during development.
- Replaced the inline holidays cache in the agenda command with a module-scope `getCachedHolidays` helper (TTL = 1h, failures not memoised), and gave `AgendaPanel` a proper `shiftedToday` reset in `onDidDispose` so a re-opened panel never inherits stale state.
- Documented the architecture decisions that the codebase relies on under `docs/adr/`: the external Rust extractor (ADR-0001), the webview-based agenda (ADR-0002), and the Org-mode wire format wrapped in markdown inline code (ADR-0003). Cross-referenced from CLAUDE.md so future changes hit the right contract.
- Documented the snake_case fields of `Task`/`DayAgenda` in `src/types.ts` as a wire contract with `markdown-org-extract` so they are not silently renamed.
- README gained CI and Codecov badges, a rollback recipe ("Rolling back to a previous version"), an explicit "Trust the extractor binary" warning, the `chore(release): vX.Y.Z` commit convention, and a link to the new ADR directory.
- Raised `engines.node` to `>=22` for the development environment; this does not affect end users (VS Code ships its own Electron Node runtime).
- `registerOrgCommand` wrapper now mediates every command registration, so any thrown error is surfaced via `Markdown Org:` notifications instead of swallowing into VS Code's silent rejection log.

## [0.4.0] - 2026-05-17

### Added

- Current anchor date is now shown as its own line under the navigation bar (weekday, day, month, year) so the "Next Week →" button is no longer visually attached to the date it would step from.
- The Week-view header for today is highlighted with `❯ ` / ` ❮` arrows in the heading's own color, making it easy to spot which day is "now".
- `markdown-org.showAgendaDay`, `showAgendaWeek`, `showAgendaMonth`, `showTasks`, and `cycleTag` now work while the agenda webview itself has focus (not only from a Markdown editor). Implemented via a `markdown-org.agendaFocused` `when`-context that the webview syncs through its lifecycle events; editing commands intentionally remain editor-only.

### Changed

- Opening `Show Agenda (Week)` now scrolls the view to today's header. Reopening it while the panel is already on the current week keeps the user's manual scroll position instead of jumping back to today.
- Navigation between weeks (`Prev Week` / `Next Week`) remembers the scroll position per anchor date, so a round-trip (e.g. `Next Week` then `Prev Week`) returns the user to the exact scroll they had before navigating, instead of snapping to today's header.
- The `Today` button always re-focuses today's header (it drops any remembered scroll for the target anchor first), so its semantics stays "snap to today" even after the user has previously scrolled away from it.
- Agenda `DEADLINE`, `SCHEDULED`, `CLOSED`, and `CREATED` labels now end with the `⌃` (U+2303) up-arrow glyph instead of a colon, indicating that the label applies to the line above. Example: `DEADLINE ⌃ <2026-05-20 Wed>`.
- Agenda task headings are now tinted by priority: `[#A]` heading text in `#f48771 bold`, `[#B]` in `#dcdcaa bold`, `[#C]` in `#4ec9b0 bold` — matching the priority marker's hue and weight exactly. DEADLINE tint (`#f48771 bold`) wins over priority tint, because a missed deadline is the louder signal.
- Internal anchor variable renamed `currentDate` → `shiftedToday` to reflect that the value is "today, with any Prev/Next offset applied", not a literal date the user picked.

### Fixed

- A touchpad text-selection gesture inside the agenda view (double-tap, drag, release) no longer opens the task that was being selected. The click handler now consults `window.getSelection()` and ignores clicks that complete a meaningful selection.

### Internal

- Extracted the agenda click-intent decision into `src/utils/agendaClick.ts` (`isMeaningfulSelection`, `resolveTaskClickIntent`), the per-anchor scroll memory into `src/utils/agendaScroll.ts` (`rememberScroll`, `recallScroll`), and the heading-tint precedence (`DEADLINE` > priority > default) into `src/utils/agendaHeadingTint.ts` (`resolveHeadingClass`). The webview embeds all of them via `Function.prototype.toString()`, so the unit tests on these helpers transitively cover the runtime behaviour.
- Added jsdom-backed unit tests in `agendaClick.test.ts` for the selection-vs-click guard (the only place where a real DOM is needed), plain-Node unit tests in `agendaScroll.test.ts` for the round-trip scroll memory, and plain-Node unit tests in `agendaHeadingTint.test.ts` for the heading-tint precedence (DEADLINE/priority/default and the irrelevant timestamp types).
- Added integration tests in `agenda.integration.test.ts` covering the new `agendaFocused` context lifecycle, the unrestricted `cycleTag` keybinding, the `navigation=true` flag emitted by `Next Week`, and the `navigation=false` flag emitted by a repeated `Show Agenda (Week)` on the same anchor.
- Added `jsdom` and `@types/jsdom` to `devDependencies`.

## [0.3.1] - 2026-05-17

### Fixed

- Agenda views in week and month modes failed with "Cannot read properties of undefined (reading 'filter')". `filterTasksByTag` now treats missing day buckets (`overdue`, `scheduled_timed`, `scheduled_no_time`, `upcoming`) as empty arrays instead of dereferencing `undefined.filter`, which matches the sparse shape that `markdown-org-extract` emits for these modes.
- Clicking a task in agenda no longer fails with "refused to open file outside workspace". The `openTask` handler now opens whatever path `markdown-org-extract` returned, which fixes navigation in setups that use symlinks, a `markdown-org.workspaceDir` outside `workspaceFolders`, or aggregate tasks from directories outside the VS Code workspace. The path guard remains in place for the user-configured `markdown-org.maintainFilePath` setting, where it actually prevents writes to system paths.
- Agenda commands now invoke `markdown-org-extract --absolute-paths`, so the file paths the extractor returns are openable directly. Without this, clicking a task tried to open `/file.md` at the filesystem root because VS Code resolved the relative path against the current working directory.
- Failures from `openTextDocument` (e.g. the file is gone) are now surfaced via an error message instead of silently dropping the click, so the agenda no longer "does nothing" when the task can't be opened.

### Internal

- `agenda.ts` now uses the same `exec.execFile` wrapper as the other commands, so the four `Show Agenda *` / `Show Tasks` commands can be exercised in integration tests.
- Added `agenda.integration.test.ts` covering each of the four show\* commands and a Day → Week → Month → Tasks switch. The week/month payloads intentionally omit some day buckets to lock the v0.3.0 regression in.
- Extracted `AgendaPanel.openTaskInEditor` so the openTask flow can be exercised from tests, and added cases for files outside `workspaceFolders`, symlinked files, and missing files.
- Replaced the tautological `panels.length >= 0` assertion in `monthView.integration.test.ts` with a check that `vscode.window.showErrorMessage` was never invoked.
- `.vscodeignore` excludes `CLAUDE.md` so the marketplace VSIX stays free of project-internal AI rules.

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
