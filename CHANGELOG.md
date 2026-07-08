# Change Log

All notable changes to the "Markdown Org" extension will be documented in this file.

## [Unreleased]

## [0.11.0] - 2026-07-08

### Added

- Google Calendar sync now maps an org repeater to a recurring event. A task
  with a repeater (`++7d`, `+1w`, `.+1m`, `+1wd`, ...) becomes a Google
  Calendar series via an `RRULE`, instead of a one-shot event. Requires an
  extractor that emits the `timestamp_repeater` field; older extractors leave
  events one-shot. Unrepresentable repeaters (e.g. `+2wd`, or an hourly
  repeater on an all-day task) stay one-shot.

### Changed

- Bundled extractor bumped to 0.10.0, which emits the `timestamp_repeater`
  field the recurrence mapping above depends on.

## [0.10.0] - 2026-06-30

### Added

- **GNOME Online Accounts (GOA) token provider for Google Calendar sync
  on Linux.** On Linux the OAuth access token can now come from a Google
  account already set up in GNOME Online Accounts instead of a
  bring-your-own OAuth client. GNOME holds the credentials and refreshes
  the token under its verified client, so there is no Google Cloud project
  to create and no 7-day test-client token expiry. Controlled by the new
  `markdown-org.gcalSync.authProvider` setting (`auto` (default) | `goa` |
  `oauth`): `auto` uses GOA on Linux when a Google account is present,
  otherwise the existing OAuth flow. `markdown-org.gcalSync.goaAccount`
  pins which account to use; **Connect Google Calendar** picks one when
  several exist. The token is read over DBus (`busctl`, with a `gdbus`
  fallback); nothing is stored in the OS keychain in this mode. The REST
  sync pipeline is unchanged. See ADR-0011.

### Documentation

- README documents the GOA setup path; new ADR-0011 records the design.

## [0.9.0] - 2026-05-29

### Added

- **CANCELLED task status.** Headings can be marked `CANCELLED` via the
  new **Set CANCELLED** command (`Ctrl+K Ctrl+X` / `Cmd+K Cmd+X`; repeat
  to clear). Both spellings are recognised on read -- `CANCELLED` (the
  common convention) and `CANCELED` (the Org manual's single-`L` form);
  the command writes `CANCELLED`. A cancelled task renders struck-through
  in the agenda. Recognising both spellings requires markdown-org-extract
  0.9.0 (bundled).
- Google Calendar sync now excludes `CANCELLED` tasks from the push and
  deletes any event they already had, unconditionally (independent of the
  `gcalSync.onDone` setting, which governs `DONE`). The extractor is
  invoked with `--tasks-include-cancelled` so a freshly cancelled task
  still reaches the sync engine to have its event removed. See ADR-0010.

### Documentation

- **Promote to Maintain**: README gained a dedicated subsection explaining
  the migration workflow (cut a heading + body + children, append under
  `# incoming` in the configured maintain file, re-level to `## `). The
  command itself is unchanged.

### Internal

- `src/utils/maintainPromote.ts` extracts the level-shift / `# incoming`
  insertion math out of the `promoteToMaintain` command as a pure,
  vscode-free helper (`computeMaintainInsertion`). The editor binding in
  `src/commands/moveHeading.ts` now calls into it.
- Added unit coverage for the helper (12 cases: re-level math, clamp,
  `# incoming` case-insensitive / first-match-wins, three append-shapes)
  and integration coverage for the command itself (`# incoming` exists,
  missing, maintain file missing, `maintainFilePath` not configured;
  source edit + atomic maintain write checked end-to-end).

## [0.8.0] - 2026-05-28

### Added

- **Google Calendar sync (opt-in, push only).** Push tasks that carry an
  active `SCHEDULED` / `DEADLINE` timestamp to your own Google Calendar:
  connect once with your OAuth client, pick a calendar, then **Sync Now**
  (or sync on save). A status-bar spinner shows progress; the summary toast
  lists the affected events on a single line and **Show details** opens a
  per-event log. Marking a task DONE deletes its event (configurable), and
  re-opening it (DONE → TODO) revives that event rather than leaving an
  empty calendar. See the [README](README.md#google-calendar-sync) section
  (with connect / select / sync demos) and ADR-0010. The bullets below
  break the feature down by build phase.
- Reads the optional `properties` object emitted per task by
  markdown-org-extract (parsed from an `org-properties` fenced code
  block). See ADR-0009.
- Google Calendar sync (opt-in, push only) -- foundation: connect /
  disconnect via BYO Desktop OAuth client, loopback + PKCE, refresh token
  stored in the OS keychain (`SecretStorage`). Zero runtime dependencies.
  See ADR-0010.
- Google Calendar sync: calendar selection (settings `gcalSync.calendarName`
  / `gcalSync.calendarId` and a "Select Google Calendar" command), REST
  client, deterministic event id, and task-to-event mapping.
- Google Calendar sync: "Sync Now" command and an optional
  debounce-on-save trigger; idempotent push (create / update / delete)
  keyed by org-id, with an in-process queue / cancel policy and a
  cross-process workspace lock so only one sync runs at a time. Property
  write-back (`ID` / `GCAL_EVENT_ID`) is conflict-safe: it is deferred
  (not forced) when the target file has unsaved edits or has shifted
  since extraction, reported as `deferred` in the sync summary, and
  retried on the next sync -- a task with a freshly minted id is not
  published until its id is written back, so no duplicate events are
  created. Settings: `gcalSync.concurrencyPolicy`, `gcalSync.syncOnSave`,
  `gcalSync.syncOnSaveDebounceMs`, `gcalSync.onDone`,
  `gcalSync.defaultEventMinutes`.

### Changed

- macOS keybindings: every `Ctrl+K …` chord now ships a `Cmd+K …` mac
  override (VS Code does not auto-map `Ctrl` to `Cmd`), so the shortcuts
  match macOS conventions. `Shift+Up` / `Shift+Down` are unchanged.
- Sync-on-save is now silent on success and "no changes"; a toast
  appears only when something failed (`failed > 0`). Manual **Sync Now**
  keeps the full summary toast. The status-bar spinner and the
  **Calendar Sync** output channel run on every sync regardless of
  trigger.

### Fixed

- `Shift+Up` / `Shift+Down` (timestamp / keyword cycling) now works
  immediately after a fresh VS Code start, without first opening the
  agenda. The extension was activating lazily on its first contributed
  command, so the `markdown-org.timestampAdjustable` when-context was
  unset and the keystroke fell through to the editor's default
  `cursorUpSelect`. Added `onLanguage:markdown` to `activationEvents` so
  the context (and the bracket diagnostics and sync-on-save trigger)
  wire up as soon as a markdown file is opened.

### Internal

- Pure, vscode-free `src/utils/orgProperties.ts` builds and upserts an
  `org-properties` block in document text (insert after planning lines, or
  replace in place; sorted keys; idempotent). The editor binding and a
  sync trigger that consume it are deferred to the Google Calendar sync
  change.
- Bundled extractor bumped from 0.6.0 to 0.7.0 (Google Calendar sync
  needs `--tasks-include-done`, which lands in 0.7.0); the matching
  binary is downloaded per-target by `scripts/download-extractor.sh`
  during the release packaging job.

## [0.7.0] - 2026-05-26

### Changed

- The agenda webview now follows the active VS Code theme (light / dark / high contrast) instead of a hardcoded dark palette, and its padding / margins are unified onto a single 4/8/12/16/20 spacing scale. Day headers render weekday names per the configured `markdown-org.weekdayLocale` rather than a fixed locale.
- CLOCK keybindings shortened from `Ctrl+K Ctrl+K Ctrl+C Ctrl+{S,F,V}` to `Ctrl+K Ctrl+C Ctrl+{S,F,V}` (Insert CLOCK Start / Finish / Table). This frees the `Ctrl+K Ctrl+K Ctrl+C` chord for `insertCreated`, which the longer CLOCK chords previously shadowed.
- Timestamp adjustment (`Shift+Up` / `Shift+Down`) is now gated behind a new `markdown-org.timestampAdjustable` when-context, so the keys only rebind on timestamp lines and fall through to the editor's default behaviour elsewhere.
- Commands are grouped under a `Markdown Org` category in the Command Palette instead of repeating a `Markdown Org:` prefix in every title; the visible palette label is unchanged.
- Bundled extractor bumped from 0.5.0 to 0.6.0.

### Fixed

- The agenda tag filter (`cycleTag`) no longer loops without advancing when every task carries the same `ALL` tag.

### Performance

- Bracket-policy diagnostics are debounced on rapid document edits, so large files no longer re-validate on every keystroke.

### Internal

- Agenda theme tokens and the spacing scale live in the vscode-free `src/views/agendaStyles.ts`, guarded by unit-tested theming and spacing invariants; the command category contract is unit-tested too.
- `incrementTimestamp` and the weekday-name tables were moved into the vscode-free `src/utils/incrementTimestamp.ts` / `src/utils/dayNames.ts` and covered by a unit test that pins month-overflow parity with org-mode (`2026-05-31` +1 month produces `2026-07-01`, with no clamp to the last day of the target month, exactly like Emacs `org-timestamp-change`). The old tautological `Increment*`/`Decrement*` cases were dropped.
- Transitive `qs` pinned to `^6.15.2`; devDependencies bumped (`mocha` 11.7.6, `typescript-eslint` 8.60.0); `codecov-action` bumped with a coverage ratchet and a secret-ignore rule in CI.
- Timestamp / heading builders unified; `scanSiblingKeywords` shared through a lazy accessor; test files migrated to `node:timers/promises`; the agenda after-hook uses a per-suite `mkdtemp`.
- Documentation: settings reference, new ADRs, anchor fixes and TOCs; demo GIFs and README screenshots regenerated to reflect the theme/spacing and CLOCK chord changes.

## [0.6.1] - 2026-05-25

### Added

- Per-keyword active / inactive bracket policy for timestamps, mirroring the upstream extractor 0.5.0 contract ([extractor ADR-0014](https://github.com/VitalyOstanin/markdown-org-extract/blob/master/docs/adr/0014-active-and-inactive-timestamps.md), editor side [ADR-0005](docs/adr/0005-active-and-inactive-timestamps.md)): `SCHEDULED:` / `DEADLINE:` stay active `<...>`, `CLOSED:` / `CREATED:` are now inactive `[...]`; CLOCK and bare inline timestamps accept both forms.
- Diagnostic source `markdown-org` (code `bracket-policy`, severity Warning) surfaces keyword lines whose bracket form violates the policy or whose pair is mixed (`<...]`, `[...>`). A preferred Quick Fix **Convert to canonical bracket form** rewrites the brackets in place (`Ctrl+.` on the warning).
- New command `Markdown Org: Toggle Timestamp Active/Inactive` (`markdown-org.toggleTimestampActive`) flips `<...>` ↔ `[...]` on a bare inline timestamp under the cursor. On keyword lines the command refuses with a keyword-named message and points at `Shift+Up` for keyword cycling. The command ships without a default keybinding -- it is reachable from the Command Palette only ([ADR-0006](docs/adr/0006-bracket-toggle-keybindings.md)).

### Changed

- **Breaking**: `insertCreated` now writes `CREATED: [YYYY-MM-DD Dayname HH:MM]` (inactive form), and `setTaskStatus('DONE')` writes `CLOSED: [YYYY-MM-DD Dayname HH:MM]`. Pre-existing files with `CREATED: <...>` or `CLOSED: <...>` will raise a warning on open; apply the Quick Fix per line, or run a one-time bulk rewrite:

    ```bash
    # Migrate stored CLOSED: <YYYY-MM-DD ...> to CLOSED: [YYYY-MM-DD ...]
    sed -i -E 's/`CLOSED: <([^>]+)>`/`CLOSED: [\1]`/g' $(rg -l '`CLOSED: <' .)
    # Migrate stored CREATED: <YYYY-MM-DD ...> to CREATED: [YYYY-MM-DD ...]
    sed -i -E 's/`CREATED: <([^>]+)>`/`CREATED: [\1]`/g' $(rg -l '`CREATED: <' .)
    ```

    The recipe matches the one shared with extractor 0.5.0.

- `markdown-org.insertDeadline` keybinding changed from `Ctrl+K Ctrl+K D` to `Ctrl+K Ctrl+K Ctrl+D` to match the shape used by `insertCreated` (`Ctrl+K Ctrl+K Ctrl+C`) and `insertScheduled` (`Ctrl+K Ctrl+K Ctrl+S`). The shorter `Ctrl+K Ctrl+D` still belongs to `setDone`; VS Code disambiguates the chord by length after the second `Ctrl+K`.
- `Shift+Up` / `Shift+Down` (`adjustTimestamp`) now preserves the bracket form when shifting dates / times on inline timestamps -- an inactive `[...]` stays inactive across the edit.

### Internal

- `TIMESTAMP_LINE_REGEX` (`src/orgPatterns.ts`) is now strict per ADR-0005: it matches a keyword line only when the bracket form satisfies the policy table. The helper `matchTimestampLine` replaces ad-hoc consumers of the raw regex.
- Bracket validation is split across `src/diagnostics/bracketPolicy.ts` (pure validator, fully unit-tested) and `src/diagnostics/timestampBrackets.ts` (vscode adapter wiring the `DiagnosticCollection` and `CodeActionProvider`).
- Bundled extractor bumped from 0.4.2 to 0.5.0 (`package.json` `x-markdown-org.extractorVersion`); the matching binary now ships in `bin/markdown-org-extract`. The integration smoke test (`src/test/integration/extractorBundled.integration.test.ts`) continues to assert that `<bin>/<binary> --version` matches the manifest field.
- New integration suite `src/test/integration/keybindings.integration.test.ts` locks the package.json keybinding contract for the three Insert\* commands and asserts that `markdown-org.insertDeadline` is a registered command with an active-`<...>` output.

## [0.6.0] - 2026-05-22

### Added

- The `markdown-org-extract` binary is now bundled inside the VSIX (one per VS Code platform: `linux-x64`, `darwin-x64`, `darwin-arm64`, `win32-x64`). Users no longer need to `cargo install markdown-org-extract` before installing the extension. The pinned extractor version is declared once in `package.json` (`x-markdown-org.extractorVersion`) and consumed by both the CI download step and the runtime locator.
- Extension is now published to the [Open VSX registry](https://open-vsx.org/extension/vitalyostanin/markdown-org-vscode) so VSCodium / Cursor / Gitpod / code-server users can install it with `code --install-extension vitalyostanin.markdown-org-vscode`. A version badge linking to the Open VSX page has been added to README.

### Changed

- `markdown-org.extractorPath` default changed from `"markdown-org-extract"` to `""` (empty). An empty value now means "use the bundled binary, fall back to PATH"; existing absolute or custom-name overrides keep their previous behaviour. The Settings page description has been rewritten to match.
- README's Quick Start no longer requires a separate `cargo install`. The "Dependencies" section now documents the bundled binary and points the override scenarios to [`markdown-org.extractorPath`](#markdown-orgextractorpath).

### Internal

- `scripts/download-extractor.sh` downloads a per-target prebuilt extractor archive from the extractor's GitHub Releases, verifies the upstream `.sha256`, and unpacks the binary into `bin/`. Idempotent: a second run on the same version skips re-download.
- `src/utils/bundledBinary.ts` extracts the platform-mapped path lookup as a pure function so unit tests can exercise the layout without spinning up a VS Code extension host.
- `src/utils/extractor.ts` now resolves the extractor in this order: explicit `markdown-org.extractorPath` setting → bundled binary at `<extensionPath>/bin/markdown-org-extract[.exe]` → `markdown-org-extract` in `PATH`.
- `.github/workflows/release.yml` split into `test` → `validate-tag` → `package` (matrix across the four VS Code targets) → `publish` (downloads the per-target artifacts and attaches all of them to the GitHub Release in one step). Smoke-test now also asserts the bundled binary's presence inside the VSIX.
- `.vscodeignore` extended to drop `temp/**`, `DEVELOPMENT.md`, `TAG_FILTERING.md`, and `.claude-dir-settings.yaml` from the VSIX. Open VSX rewrites relative links in README to GitHub URLs, so the in-VSIX copies of `DEVELOPMENT.md` and `TAG_FILTERING.md` were dead weight.
- ADR-0004 (`docs/adr/0004-open-vsx-distribution.md`) records the decision to distribute via Open VSX + GitHub Releases only and the consequences of opting out of the Microsoft Marketplace. References to Marketplace publishing were removed from `TODO.md`, `DEVELOPMENT.md`, `README.md`, and demo test comments; `package.json` `qna` flipped from `"marketplace"` to `false`.

## [0.5.1] - 2026-05-21

### Documentation

- Re-recorded all demo GIFs and screenshots at 1280×720 with `window.zoomLevel: 1`, so the editor, agenda and clocktable read clearly in a typical GitHub viewport instead of the previous 1920×1080 capture downscaled through lanczos. The first frames now already show Monokai colours instead of the transient default-dark palette that bled through on slower runs.
- Dropped blank lines between `## Heading` and the inline-code timestamps in the README's syntax examples; they were inserted automatically by Prettier's embedded-language formatting and did not match the wire format the extension actually consumes.

### Internal

- The recording pipeline (`scripts/record-demo.js`, `scripts/screenshot-demo.js`, `src/test/demo/_helpers.ts`) now seeds every demo workspace's `settings.json` (English weekdays, hidden activity bar, `window.zoomLevel: 1` for the GIF scenarios), awaits `vscode.window.onDidChangeActiveColorTheme` before recording starts, and uses `xdotool --sync` so the X11 window resize cannot race subsequent demo steps. A clone or CI checkout reproduces identical assets.
- Prettier now runs with `embeddedLanguageFormatting: "off"` so fenced ` ```markdown ` blocks inside the README are not silently rewritten on each `npm run format`.

## [0.5.0] - 2026-05-20

### Added

- Numeric priorities `[#0]`..`[#64]` are now supported on TODO/DONE headings, matching the `markdown-org-extract` wire contract. The agenda sorts them numerically and groups them under a single `(Priority)` heading.
- All Org-mode timestamp repeaters (`+`, `++`, `.+`, `--`) are recognised in SCHEDULED/DEADLINE/CREATED/CLOCK lines. Previously only `+1d`-style repeaters were parsed.
- New configuration `markdown-org.weekdayLocale` (`ru` / `en`, default `ru`) controls the language of weekday short names inserted into timestamps.
- Extension icon (128×128 Monokai M+O monogram) and a `galleryBanner` are now part of `package.json`, so the Extensions view renders a recognisable tile.
- Filled the marketplace metadata in `package.json` (`displayName`, `description`, `categories`, `keywords`, `repository`, `homepage`, `bugs`, `license`, `qna`).

### Fixed

- `clocktable` no longer drops DONE tasks and plain headings that have CLOCK entries. Previously only TODO tasks contributed to the table, hiding completed work from time-tracking reports.

### Changed

- Agenda time-info cell is now two lines (timestamp type on its own line, time on the next), and the dedicated caret marker `⌃` was removed -- it was redundant with the existing highlight.

### Documentation

- Rewrote README for end users: hero GIF, four demo animations and five screenshots inline, install path via GitHub Releases .vsix.
- Moved developer-facing material (build, tests, install from source, release process) into `DEVELOPMENT.md`; README links to it from a single line.
- Recorded the project's serialization rule: production code uses `safe-stable-stringify` instead of `JSON.stringify` (preventive -- no production call sites yet).

### Internal

- New demo-recording pipeline: an integration test exercises the extension while `xvfb-run` + `ffmpeg` capture the X server, producing the GIFs shipped in README. Re-recorded all demos against Monokai theme on a full-screen window for consistency.
- `.vscodeignore` now drops demo test workspaces (`test-workspace-demo*/`), the demo vscode-test config, and `media/*.mp4` source files. The final VSIX is 4.26 MB / 52 files.
- VS Code's built-in screencast mode is enabled inside demo scenarios so key chords are visible in the recordings.

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
