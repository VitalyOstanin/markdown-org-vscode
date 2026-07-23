# TODO

## Design

- [x] Redesign the visual language of the agenda/webview UI
    - Shipped as a selectable agenda style (`markdown-org.agendaStyle`:
      `monospace` | `native` | `hybrid` | `table`, default `table`) plus an
      in-panel style menu and the `Cycle Agenda Style` command. Single semantic
      DOM with CSS presets selected by `body[data-agenda-style]`; applies to all
      modes including the month calendar.
    - Colors remain fully theme-driven via `var(--vscode-*)` tokens (light /
      dark / high-contrast), enforced by a unit-test invariant (no hardcoded
      HEX). A separate light/dark "force" setting was intentionally dropped:
      the tokens already follow the active editor theme, so a webview-only
      override would fight the theme rather than help.
    - `markdown-org.agendaFontFamily` overrides the proportional font for the
      native/hybrid styles.
    - Follow-ups (deferred): capture README screenshots of the three styles;
      consider codicon-based status/priority icons.

- [ ] Verify agenda localization across languages
    - Check weekday/month names, date formats, and any user-facing strings
      render correctly for several locales (RTL not required), not just the
      current one.

- [ ] Sticky day/date header at the top of the agenda
    - Keep the current day/date heading pinned to the top of the webview while
      scrolling through that day's tasks, so the active day stays visible.

- [ ] Contextual navigation between agenda modes (day / week / month) with a date anchor
    - Current state: the mode switcher (Day / Week / Month / Tasks buttons,
      `renderModeSwitch`) already exists, but `switchMode` always re-anchors to
      _today_ (`AgendaPanel.shiftedToday`), so switching level from a
      non-current week/month drops the viewed date. Month calendar cells already
      drill into Day view for the clicked date (`attachCalendarListeners` ->
      `navigateToDay` -> `navigate` with `switchToDay`). Week day-headers
      (`.day-header[data-date]`) are not yet clickable.
    - Goal: click a day to zoom in, and preserve the viewed anchor when changing
      level -- e.g. clicking a weekday name in Week view opens _that_ day's Day
      card, not today's.
    - UI variants (proposed 2026-07-23):
        1. Clickable week day-header -> Day view for that date. Reuses the existing
           `navigateToDay`/`switchToDay` plumbing; add a hover affordance (pointer
           cursor, weekday underline). Matches the requested example.
           (recommended, minimal)
        2. Anchor-preserving mode buttons: pass the currently-viewed date into
           `switchMode` instead of `shiftedToday`, so Week->Day lands on the
           week's focus day and Month->Week on the viewed month.
           (recommended, complements 1)
        3. Zoom in/out + breadcrumb: an explicit Day <-> Week <-> Month hierarchy
           with a breadcrumb of the current level; the coarser level zooms out
           keeping the anchor. (more UI, clearer model)
        4. Keyboard: d / w / m to switch level on the hovered or focused day.
           (secondary, complements the buttons)
    - Decision pending: which variants to implement; whether the day-number or
      the whole day-header is the click target.

- [ ] Rework the top navigation bar (`#nav-bar`, `renderNavBar`)
    - The bar holds the mode switch (Day/Week/Month/Tasks), Prev/Today/Next,
      the tag indicator and the style menu. Two problems:
    1. Visual redesign: it currently looks crude (bare buttons). Bring it in
       line with the `table`-style visual language -- consistent spacing,
       theme-token colours, grouped controls, a lighter affordance for
       Prev/Today/Next. Distinct from the day/date header restyle above.
    2. Sticky on scroll: pin the bar to the top of the webview so it stays
       visible while scrolling the agenda down (currently it scrolls away).
       Coordinate with the "Sticky day/date header" item so the two sticky
       elements stack rather than overlap.

- [ ] Redesign the agenda style picker (`renderStyleMenu`)
    - The style menu (the "Aa v" button + dropdown listing monospace / native /
      hybrid / table) looks crude and is disconnected from the rest of the bar.
      Rework it to match the `table`-style visual language: clearer active-item
      marker, theme-token colours, tidy spacing, and possibly a small preview
      or icon per style so the choice is legible at a glance. Part of the
      broader top-nav-bar rework above; kept separate because the picker has its
      own open/close behaviour and item list.
    - For detailed consideration later (no decision yet).

- [ ] Hover tooltips on non-obvious UI elements
    - Any element whose meaning is not self-evident from its look should show a
      tooltip on hover explaining what it is. Examples: the type-flag glyphs
      (red flag = deadline, clock = scheduled, repeat, cancelled), the status
      dot (attention level: deadline / overdue / done / cancelled), the priority
      chip, the day-nav arrows, and the nav-bar buttons.
    - Minimum: a `title` attribute; upgrade to a styled custom tooltip only if
      styling or a hover delay is needed. Keeps the visual language terse
      (colour/shape carry meaning) without forcing the user to memorise a
      legend. Currently only the style-menu button has a `title`.
    - Design-language principle recorded alongside the other agenda visual
      principles (design log, principle 7).

## Configuration

- [x] Remove hardcoded path from package.json default settings
    - Changed extractorPath default to `markdown-org-extract` (searches in PATH)
    - Changed maintainFilePath default to empty string (disabled)
    - Added dateLocale setting with `en-US` default
- [x] Add helpful error messages for missing configuration
    - extractorPath: shows error if not found
    - maintainFilePath: shows error if not configured when using Promote to Maintain
- [x] Add validation for extractorPath configuration
    - Check if file exists using fs.existsSync() for absolute paths
    - Check if command exists in PATH using 'which' for relative paths
    - Show clear error message if extractor not found with installation instructions

## Publishing

- [x] Add publisher field to package.json
    - Added `"publisher": "vitalyostanin"` (reused as the Open VSX namespace).
- [x] Pick a distribution channel
    - Open VSX (`vitalyostanin.markdown-org-vscode`) + GitHub Releases (per-target VSIX). Microsoft Marketplace is out of scope -- see [ADR-0004](docs/adr/0004-open-vsx-distribution.md).
- [ ] Generate an SBOM (CycloneDX or SPDX) and attach it to GitHub Releases
    - Currently low-value: the VSIX bundles minimal production deps and the user base is individual.
    - Becomes worth doing once production-deps surface grows or corporate adoption picks up (CRA/EO 14028 readiness, Dependency-Track / Trivy ingestion).
    - Implementation sketch: add a step to `.github/workflows/release.yml` that runs `npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json` after the VSIX is built and attaches `sbom.cdx.json` to the GitHub Release alongside the `.vsix`.

## Documentation

- [x] Improve README.md
    - Added Features section with Org mode link
    - Added Quick Start section
    - Added comprehensive syntax examples (tasks, priorities, timestamps, repeaters)
    - Documented all commands with hotkeys in tables
    - Added detailed Settings section with examples
    - Documented markdown-org-extract dependency and installation
- [ ] Refresh README screenshots and demo video after all UI changes
    - Recapture the agenda screenshots and the demo video/GIF once the visual
      changes land (table style, nav-bar rework, style-picker, tooltips), so the
      README reflects the current UI, not the old one.
    - Capture each in BOTH light and dark editor themes.
    - Auto-switch light/dark asset to the viewer's active theme, on every render
      target where it is supported (not just GitHub): GitHub, Open VSX, the VS
      Code Marketplace page, and the in-editor Extensions README preview.
    - Mechanism: the `<picture>` + `prefers-color-scheme` pattern --
      `<picture><source media="(prefers-color-scheme: dark)" srcset="agenda-dark.png"><img src="agenda-light.png" alt="..."></picture>`.
      GitHub honours this (general knowledge). Support on Open VSX / VS Code
      Marketplace / the in-editor preview is unverified -- their markdown
      renderers sanitise HTML and may ignore the media query; verify each and
      note which fall back.
    - Fallback for renderers that ignore the media query: the `<img>` default
      must read acceptably in both themes -- either a theme-neutral capture or a
      single side-by-side light|dark composite. Avoid a pure-dark default that
      looks broken on a light page.
    - The older GitHub-only `#gh-dark-mode-only` / `#gh-light-mode-only` anchor
      hack is GitHub-specific and does not generalise; prefer `<picture>`.
- [x] Add Open VSX version badge to README
    - Shipped in 0.6.0 alongside the auto-publish workflow ([ADR-0004](docs/adr/0004-open-vsx-distribution.md)).
- [x] Create CHANGELOG.md
    - Documented version 0.1.0 features
    - Set up format for future releases

## Testing

- [x] Add unit tests for core functionality
    - Test timestamp parsing and manipulation
    - Test task status changes
    - Test priority toggling
    - Test heading parsing and extraction
- [x] Set up test framework (Mocha)
- [x] Add integration tests for commands
    - Test task status commands (setTodo, setDone, togglePriority)
    - Test timestamp commands (insertCreated, insertScheduled, insertDeadline)
    - Test timestamp navigation (timestampUp, timestampDown)
    - Test command execution in real VS Code environment
