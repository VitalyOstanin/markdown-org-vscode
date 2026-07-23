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

- [x] Sticky day/date header at the top of the agenda
    - Shipped: each `.day-header` is `position: sticky` and pins just below the
      sticky nav-bar (offset `--agenda-header-h`, measured by `syncHeaderOffset`)
      while that day's tasks scroll under it. The header background hides the
      scrolling tasks; `scroll-margin-top` keeps `scrollToWeekFocus` from parking
      today's header behind the nav-bar. Top spacing moved margin -> padding so
      the sticky box has no transparent gap. Applies to both base and table
      presets.

- [x] Contextual navigation between agenda modes (day / week / month) with a date anchor
    - Shipped: variant 1 (clickable week day-header -> Day view for that date,
      via `wireDayHeaderNavigation` + `navigateToDay`, with a pointer/underline
      affordance and a tooltip) and variant 2 (anchor-preserving mode buttons)
      are both in place -- variant 2 was already implemented (`switchMode`
      forwards `AgendaPanel.shiftedToday`, not today). The whole day-header is
      the click target. Variants 3 (breadcrumb) and 4 (keyboard d/w/m) are
      deferred as secondary; kept below for reference.
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

- [x] Rework the top navigation bar (`#nav-bar`, `renderNavBar`)
    - Shipped both parts:
    1. Visual redesign: Prev/Today/Next are now a lightened secondary segment
       (`.date-nav`, matching `.mode-switch`) instead of three accent-coloured
       primary buttons; consistent token-driven spacing and grouping.
    2. Sticky on scroll: the control row and the current-date line are wrapped
       in `.agenda-header`, which is `position: sticky; top: 0` with the editor
       background and a bottom border. Negative margins cancel the body padding
       so it spans edge-to-edge. It stacks above the sticky day-headers (they
       offset by its measured height), so the two never overlap.

- [x] Redesign the agenda style picker (`renderStyleMenu`)
    - Shipped: the collapsed button now shows the current style ("Aa Table ▾")
      so the choice is legible without opening; the dropdown gains a
      non-selectable "Agenda style" caption, a leading checkmark column on the
      active row (reserved via `visibility` so labels stay aligned), and a
      per-style hover tooltip. The stale `|| 'hybrid'` fallback was replaced by
      an injected `defaultAgendaStyle` (tracks `DEFAULT_AGENDA_STYLE`), and the
      style metadata (id/label/description) now lives in one `agendaStyleMeta`
      array shared by the button, the list and the tooltips.
    - Deferred: a small per-style preview/icon.

- [x] Hover tooltips on non-obvious UI elements
    - Shipped as `title` attributes: the type-flag glyphs, the status dot
      (attention level) and the priority chip get value-derived tooltips via
      `flagTooltip` / `attentionTooltip` / `priorityTooltip` (unit-tested,
      inlined into the webview); the day-nav arrows ("Today"), the Prev/Today/
      Next buttons, the mode buttons ("Switch to X view"), the tag indicator
      ("Click to cycle the file-tag filter"), the clickable week day-headers
      ("Open this day in Day view") and the style picker (button + per-item)
      all carry titles too.
    - Deferred: upgrading to a styled custom tooltip (hover delay/positioning)
      if the native `title` proves insufficient.
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
