# TODO

## Table of Contents

- [Design](#design)
- [Configuration](#configuration)
- [Publishing](#publishing)
- [Documentation](#documentation)
- [Testing](#testing)

## Design

- [ ] Find inside the agenda page, so the built-in webview find widget can be
      switched off
    - Why: while a webview is open in the editor area, "Maximize Panel Size"
      undoes itself. Hiding the editor part releases the webview, which hides
      its find widget, which focuses the webview back, which reactivates the
      editor group -- and the layout restores the editor area it had just
      hidden. Reported upstream as microsoft/vscode#248324 (open, Backlog),
      with microsoft/vscode#305708 proposing the one-line fix; neither is in a
      release.
    - The widget is created eagerly and only under `enableFindWidget`, so
      turning that option off breaks the chain -- at the cost of `Ctrl+F`, `F3`
      and `Shift+F3` over the agenda, which run
      `editor.action.webvieweditor.*` (`src/utils/agendaFindCommands.ts`).
    - So the way to keep both is a find bar of the page's own: input,
      highlighting, next/previous, a match count, both languages, tests. Then
      `enableFindWidget: false` costs nothing.
    - Not started, and not urgent: dragging the panel's edge still works.

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
    - `markdown-org.agendaFontFamily` overrides the proportional agenda font.
      (The agenda was later collapsed to the single `table` style -- see below.)
    - Follow-ups (deferred): capture a README screenshot of the table style;
      consider codicon-based status/priority icons.

- [x] Collapse to `table` as the single agenda style
    - Done: dropped `monospace` / `native` / `hybrid`. Removed the other presets
      from `agendaStyles.ts`, the `markdown-org.agendaStyle` enum from
      `package.json`, the style picker (`renderStyleMenu`) and the
      `Cycle Agenda Style` command, and hardcoded `body[data-agenda-style="table"]`.
      `markdown-org.agendaFontFamily` is kept (table honours it).
    - Also removed the now-orphaned `markdown-org.agendaMonospaceFontFamily` and
      `markdown-org.agendaTableAllMono`: after the collapse the mono font var had
      a single, partly-broken consumer (the table's numeric columns use the
      proportional font with `tabular-nums`, not the mono font).

- [x] Bring the Tasks and Month views into the card visual language
    - Tasks: the flat priority list became a card -- a sticky summary bar
      (`N tasks / K priority A / M done`) plus one section panel per priority
      group (A, B, C, then the unprioritised backlog), each with a count chip
      tinted like its priority. It reuses the Day card's chrome
      (`renderSummaryBar` / `renderSectionPanel`); the grouping and counts are
      pure and unit-tested in `agendaTaskGroups.ts`. The empty-time em-dash
      placeholder is suppressed in this card, where most rows have no clock.
    - Month: rounded cells on a hairline border with a transparent surface,
      uppercase weekday captions, muted day numbers that lift for days holding
      work, and an inset accent ring for today (instead of a heavier border
      that shifted the grid). The binary "has tasks" dot became a count chip
      showing how many tasks the day holds, turning red when any are overdue;
      the counts come from `agendaMonthCells.ts` (unit-tested).

- [x] Compact mode for the agenda header (`.agenda-header`)
    - Shipped as `markdown-org.agendaHeaderMode` (`auto` | `full` | `compact`),
      which answers the open question with "both": `auto` follows the panel
      height, the other two pin the layout.
    - The compact layout turns `.agenda-header` into a flex row, so the hero
      date shares a line with the controls, drops it to `--font-lg`/`--font-xs`
      and tightens the padding. No control is hidden -- otherwise `auto` would
      remove one by resizing. (An earlier attempt used `order: -1` on a child of
      a block parent, which does nothing; the header only looked compact.)
    - The decision lives in `src/utils/agendaHeaderMode.ts` and is inlined into
      the page, which toggles a single `compact-header` class on `<body>`; the
      header's ResizeObserver then re-measures `--agenda-header-h`, so the
      sticky day-headers keep their offset. Changing the setting reflows an open
      panel through a `headerMode` message (no shell rebuild, no re-render).
    - Note for future inlined helpers: only the function's own source travels,
      so its body may not reference module-level names -- an exported const used
      as a default parameter arrives as a read off the module object and the
      page fails to load. Guarded by a check in the agenda integration suite.

- [x] Verify agenda localization across languages
    - Covered by `src/test/unit/agendaLocales.test.ts`, which walks eleven
      locales (Latin, Cyrillic, CJK, RTL, and a region whose digits are not
      ASCII) and asserts the shape rather than the wording, since the wording
      comes from the running Node build's ICU data: every day-header part is
      filled in, the weekday actually varies by locale, offset dates stay on
      one line, and a malformed tag degrades instead of throwing.
    - The interface language is checked on its own axis: every counted noun
      resolves for counts 0-120 in both shipped languages, so none can render
      as "5 undefined".
    - Not covered, deliberately: RTL layout. The stylesheet uses physical
      properties, so an RTL interface language would need a separate pass; the
      shipped languages are both LTR.

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

- [x] Tooltips on the rest of the agenda
    - Done. Every element the 2026-08-09 walk found bare now explains itself:
      the time column (`.time-plain`) names the start, the span when the entry
      has an end, and says "all day" where it draws nothing at all -- the empty
      cell was the one statement nothing spelled out; the heading (`.heading`)
      repeats what it says and adds the file and the line it is written on,
      which is what tells two identical headings from two directories apart;
      the offset column (`.offset`) names the distance and its direction, read
      until now off colour alone; the summary counts (`.day-summary-stat`) say
      what each number is a count of, since "3 overdue" never said overdue out
      of what; each glyph inside the git chip (`.git-chip-stat`) carries the
      clause it contributes to the chip's own tooltip; and the mark on a file
      row (`.git-file-mark`) says what the glyph stands for, next to the
      button's tooltip that names the path.
    - `timeTooltip`, `headingTooltip` and `offsetTooltip` live in
      `agendaTooltips.ts` with the three that were already there, so the
      wording is unit-tested rather than asserted through the page; the strings
      are in `agendaI18n.ts` in both languages, including the counted noun for
      days and a distance-free wording for the Tasks card, which has no anchor
      day to measure from.
    - The clip chips (`.day-clip-count`) were already titled as they are
      filled in (`agendaClipMarkers.ts`).
    - Deliberately left bare: the day header (`.day-weekday` / `.day-num` /
      `.day-rest`), the hero title and its TODAY badge, the section names, and
      the day number inside a calendar cell. Each is plain text that says the
      whole of what it means, and its container already answers for the rest --
      the cell is a button titled "Open day view", the section carries a count
      chip and a fold control that both explain themselves. A tooltip there
      would repeat the label under the pointer.

- [ ] A styled tooltip of our own instead of the native `title`
    - Raised out of the deferred note above. `title` gives one line, a delay
      the page cannot set and no theming, so a tooltip that has to state a date
      and a source together does not fit in it.
    - Keyboard focus and the screen reader have to keep reading what `title`
      hands them today, so `aria-label` (or `aria-describedby`) carries the
      same text once the attribute goes.
    - The Android client needs none of this: Material's `TooltipBox` already
      owns the delay and the positioning there, so only the coverage above
      applies to it.

- [ ] Agenda rendering at scale
    - Measure the render cost of the Tasks and Month views on a large corpus
      (1k+ tasks) before choosing a fix; the pre-release review of 2026-07-25
      flagged the unbounded render but did not measure it.
    - Today every row is rebuilt on every refresh: `--tasks` is fetched without
      a limit, the whole payload crosses in one message, and `#content` is
      replaced wholesale (one save of a watched file = one full rebuild).
    - Options once measured: a per-section row cap with a "show more" control
      (sections already exist -- `renderSectionPanel`), windowing the visible
      range, or skipping the rebuild when the rendered markup is unchanged.
      The first two change what the user sees, so they need their own design
      pass rather than being slipped into a release.
    - Measured on 2026-07-26 (Tasks view, 1000 tasks, synthetic corpus; markup
      generated by the real render path, parsed and laid out in Chromium with
      the extension's own stylesheet). One refresh costs ~120 ms, split as:
      extractor ~10 ms, payload encode/decode ~2 ms, markup generation 6.3 ms,
      `innerHTML` parse 9.5 ms, **layout 92 ms**. Layout is 77% of the total and
      scales linearly (2000 tasks: ~230 ms). The document is ~30 000 px tall
      while ~900 px is on screen, which is what the layout pays for. Neither the
      extractor (`--tasks` over 4000 tasks: 24 ms) nor the payload (243 KiB at
      1000 tasks) is the bottleneck.
    - Done: `content-visibility: auto` with `contain-intrinsic-size: auto 26px`
      on `.task-line`, which drops layout from 92 ms to 14 ms (full refresh
      ~120 -> ~42 ms) and changes nothing the user sees, so it needed no design
      pass. Caveat: the scrollbar is sized from the estimate until a row has been
      shown once (measured 28 345 px against a real 29 938 px). The same property
      on `.day-section` all but removes layout but collapses the document to a
      fixed 2594 px -- not usable as it stands. Pinned by the render-cost
      invariant in `agendaStyles.test.ts`.
    - Independent second fix: skip replacing `#content` when the freshly rendered
      markup equals what is already there, so a save that did not change any task
      costs nothing.
    - Side finding: the Month view pays a fixed ~4.7 ms per render, almost all of
      it `new Intl.NumberFormat` inside `formatNumber` (~170 calls per render at
      ~25 us each). The client already memoises `Intl.DateTimeFormat` for the
      same reason (`formatDateForTitle`); numbers have no such cache, and cannot
      use a module-level one because `formatNumber` is inlined into the page.

- [ ] Read headings and timestamps through the extractor instead of the
      extension's own regexes
    - Investigate first, then agree the implementation. The problem statement
      and the questions the investigation has to answer are in the extractor's
      `TODO.md`, section "One grammar for every client, over WebAssembly".
    - What is wrong today: `TIMESTAMP_REGEX`
      (`src/utils/timestampParts.ts`) spells the whole bracket out
      positionally, while the extractor takes a date plus a free-form body it
      scans token by token, in any order. So a bracket whose tokens are written
      the other way round (`-2d +1w`) is still not recognised.
    - Three of these were closed by hand in the meantime: the space after the
      cookie is now optional, a warning cookie after the repeater parses and
      survives a shift, and a priority cookie away from the front is read and
      painted where it was typed (`findPriorityCookie`, `planPriorityToggle`;
      the extractor's ADR-0027 settles what the heading text then says). All
      three are patches to the second grammar, not an end to it: each divergence
      had to be found by comparing two implementations by hand, which is what
      one grammar would make unnecessary.
    - Publishing the extractor's regex strings would not be enough: what
      diverges is the order they are applied in and how the bracket body is
      scanned. Compiling the extractor to `wasm32` removes the second grammar
      rather than synchronising it, and `parse_heading_line` /
      `parse_timestamp_parts` already return the token ranges the cursor-aware
      commands compute by hand today.

## Configuration

- [ ] Make "long ago" a setting rather than a constant
    - The overdue backlog is split at two fixed distances: a week
      (`OVERDUE_RECENT_DAYS = 7`) separates this week's slippage from the rest,
      and a year (`OVERDUE_LONG_AGO_DAYS = 365`) separates the rest from what is
      long gone (`src/utils/agendaDaySummary.ts`). Neither is configurable, and
      neither number is right for everyone: a plan reviewed weekly wants the
      last band to start at a month, while a personal backlog kept for years
      wants it much later than a year.
    - What a setting has to decide, before the number: whether it is one
      threshold or both, whether the bands can be turned off individually, and
      what happens to a band whose name stops matching its span -- "Overdue
      earlier this year" reads wrong once the boundary is three months.
    - The split is drawn identically by the sibling client of the ecosystem, and
      the bands are how a whole backlog is acted on at once, so a threshold that
      differs between the two would mean the same task sits in a different band
      depending on where it is read. Decide the shape here and there together.

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
- [ ] Release the git status feature
    - `Unreleased` in the CHANGELOG holds the agenda git status chip, the commit
      and push actions, and the removal of the history Back / Forward buttons.
      Pick the version, move the section under it, tag and let the release
      workflow publish (`validate-tag` requires an annotated tag with a matching
      CHANGELOG section).
    - Do the media recapture above first: the release notes and the README point
      at assets that would otherwise predate the feature.
- [ ] Sign release tags
    - All release tags are annotated (CI rejects lightweight ones) but unsigned:
      `git tag -v v0.11.1` reports "no signature found".
    - For an extension shipped as a VSIX with a bundled executable inside, a
      signed tag is extra provenance for the artifact.
    - Implementation sketch: create tags with `git tag -s` (GPG or SSH signing
      key) and add a signature check next to the annotated-tag check in the
      `validate-tag` job of `.github/workflows/release.yml`.
- [x] Restore the release body of v0.11.1
    - It was tagged before its CHANGELOG section existed, so the published
      release carried the placeholder "See CHANGELOG.md for details." The
      section was added later and was pushed with
      `gh release edit v0.11.1 --notes-file <section>`; the body now matches the
      CHANGELOG section, in the same shape as every other release.
    - The gap itself is closed: `validate-tag` now fails when the CHANGELOG has
      no section for the tagged version.

## Documentation

- [x] Improve README.md
    - Added Features section with Org mode link
    - Added Quick Start section
    - Added comprehensive syntax examples (tasks, priorities, timestamps, repeaters)
    - Documented all commands with hotkeys in tables
    - Added detailed Settings section with examples
    - Documented markdown-org-extract dependency and installation
- [x] Refresh README screenshots and demo video after all UI changes
    - Every screenshot and every demo recording was recaptured against the
      current interface, in BOTH themes: Monokai for dark, Solarized Light for
      light (both built into VS Code, so no extension has to be installed).
      Files carry a `-dark` / `-light` suffix.
    - Both drivers take the theme as an argument and record both by default:
      `node scripts/screenshot-demo.js [dark|light]` and
      `node scripts/record-demo.js <scenario>|all [dark|light]`. The theme
      reaches the test as `MARKDOWN_ORG_DEMO_THEME`, which also picks the file
      suffix, so a single run cannot mix the two sets.
    - README embeds each asset through `<picture>` + `prefers-color-scheme`,
      with the light variant as the `<img>` fallback -- readable on a light page
      and acceptable on a dark one, unlike a pure-dark default.
    - The `<source srcset>` URLs are absolute
      (`https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/...`)
      while `<img src>` stays relative. Reason: when packaging, `@vscode/vsce`
      rewrites relative paths to absolute GitHub URLs only for markdown images
      and for `<img>` / `<video>` `src` (its regex in `out/package.js`); a
      `<source srcset>` is left as written. A relative one would then point
      nowhere in the published README -- and the GIFs are not in the VSIX at
      all -- so a dark-theme reader would get a broken image rather than the
      light fallback.
    - Render targets, checked against the published 0.12.0:
        - GitHub honours the media query.
        - Open VSX honours it too. Its renderer keeps `<picture>` and `<source>`
          intact: all 13 assets resolve to the `-dark` variant once the browser
          reports `prefers-color-scheme: dark`, and to `-light` otherwise.
        - The in-editor Extensions preview drops `<picture>`: VS Code's markdown
          sanitiser (1.105.1) has `source` on its tag allowlist but not
          `picture`, so the element is removed, the `<source>` children are left
          orphaned next to the `<img>`, and the light fallback is what renders --
          even though the webview itself reports `prefers-color-scheme: dark`
          under a dark theme. This is the designed fallback, not a defect; the
          alternative would be shipping dark-only assets.
        - The VS Code Marketplace page does not apply: the extension is not
          published there (see [ADR-0004](docs/adr/0004-open-vsx-distribution.md)).
    - The GitHub-only `#gh-dark-mode-only` / `#gh-light-mode-only` anchor hack
      was deliberately not used: it does not generalise beyond GitHub.
    - The GIFs were dropped from the VSIX (`media/*.gif` in `.vscodeignore`):
      two themes come to ~20 MB and would ship once per platform package to
      save a fetch in the in-editor preview alone. Package size went 21.89 MB
      -> 2.77 MB. The screenshots (712 KB) still ship, but the README preview
      does not use those copies: vsce rewrites their `<img src>` to a GitHub
      URL, so every embed is fetched over the network regardless.
    - Recording had to be pinned to X11 (`--ozone-platform=x11` in
      `.vscode-test.demo.mjs`, plus scrubbing the Wayland variables out of the
      child environment). Without it Electron picks the Wayland backend on a
      Wayland session: the demo window opens on the real screen and Xvfb
      records an empty desktop.
- [x] Recapture the screenshots and the demo video with the git status chip
    - Both themes, as always: the five screenshots and the `agenda` recording
      were reshot through the existing drivers, which do dark and light in one
      run. The other six recordings never show the agenda header and were left
      alone.
    - The demo workspace is now a git repository with one file committed but
      not pushed and one edited but not committed, so the chip carries a number
      on each counter instead of reading `✓ clean`. New asset
      `media/agenda-git-{dark,light}.png` shows the dropdown expanded to the
      files and the commit / push actions; README embeds it under the three
      view screenshots.
    - Two traps found on the way, both documented in DEVELOPMENT.md: a `.git`
      inherited from the previous run makes the Git extension answer from a
      stale, clean state (the drivers wipe the workspace, the helper refuses to
      seed over an existing repository), and driving the Command Palette from
      xdotool can lose the typed query on a loaded machine, so the screenshot
      scenario invokes the commands directly.
- [x] Add Open VSX version badge to README
    - Shipped in 0.6.0 alongside the auto-publish workflow ([ADR-0004](docs/adr/0004-open-vsx-distribution.md)).
- [x] Create CHANGELOG.md
    - Documented version 0.1.0 features
    - Set up format for future releases
- [x] Recapture every recording through the command palette
    - The recordings drove the features by keyboard shortcut, so the command
      was named only by the screencast overlay -- and the chord shown may not
      be the viewer's at all (another keymap, a rebinding). Now every scenario
      opens the palette, types the command name the way a user would, and
      holds three seconds on the highlighted entry before Enter, so the name is
      read rather than glimpsed. The palette lists the binding next to the
      command, so the chord is still on screen.
    - Repetition rule, where a step applies the same command twice in a row to
      walk a value (Timestamp Up over a date): the first invocation goes
      through the palette, the immediate repeats are sent as the chord the
      palette just showed. Otherwise each increment would cost another four
      seconds of recording for a name the viewer has just read.
    - Recaptured in both themes: `task-status`, `timestamps`, `clock`,
      `agenda`. `gcal-sync` already ran through the palette. The cost is the
      length: `task-status` went 18.6 s -> 51.9 s and its GIF 1.22 MB ->
      8.52 MB, `timestamps` reached 58 s and 13.5 MB, and the whole `media/`
      GIF set went 19 MB -> about 68 MB. Encoding
      was left at 15 fps / 1280 px after measuring the alternatives (10 fps at
      1280 saves 15%, 10 fps at 960 saves 40% but shrinks the very command
      name the recapture exists to show).
    - Two scenarios keep calling their entry point directly, and it is not an
      oversight: `gcal-connect` and `gcal-select` run against `fake.context`
      and its stubs, while the palette would invoke the real command against
      the real extension context.
    - The screenshots were deliberately left alone. They invoke commands
      programmatically, the palette is closed by the time the frame is taken,
      and driving it from xdotool is what made the query drop characters on a
      loaded machine (DEVELOPMENT.md).

- [ ] Announce the Android client (`markdown-org-android`) in the extension
    - Blocked until two things hold, both outside this repository: the
      `markdown-org-extract` refactor is finished (the wire contract stops
      moving) and the Android client has a release a reader can install. The
      gate itself is tracked in the ecosystem coordinator's TODO (section
      "Announce the Android client from the extension"), which is where the
      state of all three projects is visible.
    - What this repository then carries: a README section presenting the mobile
      client next to the existing views (screenshots in BOTH themes, per the
      capture rules above), a CHANGELOG entry, and a link to the client's
      repository. Worth deciding at that point whether the extension should
      also surface it once in the UI (a one-time notification on update) or
      leave it to the README -- a notification is more visible and more
      intrusive, so it is a decision, not a detail.

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
- [ ] Measure coverage of the code that runs inside the agenda page
    - `src/webview/agendaClient.ts` is type-checked and linted like the rest of
      the source (ADR-0012), but no coverage number covers it: c8 measures the
      extension host, and the client runs in the webview, which neither runner
      instruments. It is excluded from the unit profile so it does not sit in
      the denominator as a permanent zero.
    - What holds it today: the helpers it is handed are unit-tested modules, and
      its observable output is asserted through `queryRenderedInfoForTesting` in
      the integration suite.
    - Route chosen (2026-07-26): keep extracting page logic into `src/utils/`
      modules with unit tests, rather than collecting V8 coverage from the
      webview process. The reason the file resists extraction is its shape: the
      client is one function inlined through `toString()`, so the page has no
      module scope and everything -- the 30 injected helpers and the mutable
      session state (`UI`, `locale`, `uiLang`, `shiftedToday`, `holidays`, ...)
      -- lives in its closure. Taking that state as an explicit parameter is
      what makes a renderer testable.
    - Step 1 done: `countLabel`, `summaryStat`, `renderSummaryBar`,
      `renderSectionPanel` and the day-header markup moved to
      `src/utils/agendaSummaryHtml.ts` with 15 unit tests. What stays in the
      client are one-line wrappers that bind the live state to them.
    - Step 2 done: the whole header -- mode segment, view history, date
      navigation, header-layout button, tag dropdown and hero title -- moved to
      `src/utils/agendaNavHtml.ts` with 25 jsdom unit tests. `renderNavBar` is
      down to DOM writes and listener wiring.
    - Step 3 done: the month calendar split in two -- `buildMonthGrid` (which
      dates the grid shows) in `src/utils/agendaMonthCells.ts` and the markup in
      `src/utils/agendaCalendarHtml.ts`, together with the two locale decisions
      behind it (`resolveFirstDayOffset`, `buildWeekdayLabels`). 23 unit tests;
      the client keeps a five-line binding.
    - Step 4 done: the task row and the card shell moved to
      `src/utils/agendaCardHtml.ts` with 20 jsdom unit tests. `renderDayCard`
      and `renderTasks` are down to picking the summary pieces and mapping
      sections to rows; the row itself and the empty state are covered.
    - Remaining in the client: `handleHostMessage` (dispatch, not markup, better
      left where it is), the scroll/header-layout effects (they touch the live
      DOM by definition) and the two memoised date formatters.

- [x] Turn on the remaining strict TypeScript option: `noUncheckedIndexedAccess`
    - On in both projects as of 2026-07-26, which completes the strict set:
      `noImplicitOverride` was free, `exactOptionalPropertyTypes` landed the same
      day. 236 errors in the host project and 3 in the webview one.
    - Capture groups were the largest family (~121 sites) and the only one where
      the compiler was wrong: a group the pattern does not mark optional is
      filled whenever the pattern matched. `src/utils/regexGroups.ts` reads those
      -- `group(match, n)`, `namedGroups(match, ...keys)`, plus `splitInto` for
      strings a pattern has already vouched for -- and throws when a group the
      pattern promised is missing, rather than falling back to an empty string.
      `src/utils/exactIndex.ts` does the same for a table lookup an invariant
      next to the call already bounds (a weekday 0..6 into a seven-entry table).
    - The other families were the point of the option: an index into a line
      array, `arr[arr.length - 1]`, a record read by key. Those got real checks,
      `.at(-1)`, or an iteration that never indexes.
    - Tests assert with `!`: the value is guaranteed by the fixture, and a
      failure there reads as a test failure either way. 116 of the 127 were
      inserted mechanically from the compiler's own positions.
    - Two things the suites caught, both worth keeping in mind: reading a record
      by key is not the same as `hasOwnProperty` (dropping the guard in
      `recallScroll` let an inherited `Object.prototype` key through), and a
      helper whose source is inlined into the agenda page must not call an
      import -- `formatDayHeaderParts` picked one up and the page died with
      `regexGroups_1 is not defined`. The integration suite now trips on that
      alias pattern the same way it already trips on `exports.`.

- [x] Adopt `strict-type-checked`
    - On for `**/*.ts`, with `no-non-null-assertion` off in `src/test/**` (145
      of its 152 reports were there, all of them the fixture-reads-what-the-
      fixture-wrote pattern) and `restrict-template-expressions` set to
      `allowNumber: true` (every interpolated number here is a count or an id
      in a log line).
    - The find that paid for the pass: `no-unnecessary-condition` pointed at 20
      `?? []` guards on the agenda buckets, which are guards precisely because
      the extractor omits an empty bucket in week and month mode. The type said
      otherwise, so `DayAgenda` now declares them optional -- the same mismatch
      that shipped "Cannot read properties of undefined (reading 'filter')" in
      v0.3.0.
    - Other real ones: `escapeHtml` and `sanitizeFontFamily` had a `String()`
      conversion their `string` parameter type made dead; `mapTaskToEvent`
      asserted two fields with `!` that its `isSyncable` contract guarantees and
      now checks; `AgendaPanel.updateExistingPanel` re-asserted a panel the
      caller had already narrowed; a `<A extends unknown[]>` parameter bound
      nothing.
    - Four disable comments remain, each with its reason: a flag set from
      outside the loop body, `document.fonts` (absent in older webview
      runtimes), a dictionary `delete`, and `AgendaPanel`'s all-static shape.

- [x] Adopt the modern-TypeScript rule sets
    - `stylistic-type-checked` from typescript-eslint, plus 30 hand-picked
      modern-API rules from `eslint-plugin-unicorn`. Measured before choosing:
      `stylistic` was +101 reports, unicorn's own `recommended` preset 1529 --
      86% of it naming and filename conventions this project does not follow
      (`filename-case` wants kebab-case, `no-null` argues with the VS Code API,
      `name-replacements` renames `err` to `error` across the tree). The picked
      subset was 54.
    - 102 of the reports were fixed by `--fix`; the rest by hand. `||` became
      `??` only where the operand cannot be an empty string that has to fall
      through -- the eight places where it can (an unset `workspaceDir`, an
      empty stderr, an empty anchor or tag) keep `||` behind a disable comment
      that says why. Lazy singletons became `??=`.
    - `unicorn/prefer-node-protocol` replaced the hand-written
      `no-restricted-imports` list, which only covered the built-ins someone
      remembered to add.
    - Two rules stayed off at the time: `prefer-promise-with-resolvers` needs
      ES2024 and the projects declared `lib: ES2022`; `prefer-includes` and
      `prefer-string-starts-ends-with` are left to typescript-eslint, which
      reads types instead of guessing at the receiver. The first is on since
      the minimum host became 1.101 (ADR-0018) and both projects moved to
      `lib: ES2024`; the second pair stays with typescript-eslint.
    - `--fix` broke two things, both caught by `tsc -b`: a spread over a
      structurally-typed `ArrayLike` (now declared `Iterable`, which is what a
      NodeList is), and an `as HTMLElement` cast rewritten to `!`, which lost
      the widening (now `querySelector<HTMLElement>`).

- [x] Adopt `eslint-plugin-import-x`
    - Added with `eslint-import-resolver-typescript` (without a resolver
      `no-cycle` cannot follow an extensionless relative specifier to its `.ts`
      file). Rules on: `no-cycle`, `no-duplicates`, `no-self-import`,
      `no-useless-path-segments`, and `order`. `no-unresolved` stays off --
      `npm run typecheck` already resolves every specifier against the same
      tsconfig, and the rule would only repeat it more slowly.
    - `order` is configured to pull `vscode` ahead of the Node built-ins, which
      is how the host modules were already written; the sweep reordered 39
      import lines that had drifted from it.
    - The inlined-module rule this item was really about is enforced elsewhere,
      and better: the emitted page is asserted to contain no `exports.` read at
      all (`src/test/integration/agenda.integration.test.ts`), which catches the
      actual failure -- a helper body reading its module -- rather than the
      import statement that may or may not cause it. Alongside it,
      `@typescript-eslint/consistent-type-imports` now forces the erasable case
      to be spelled `import type` on its own line, so a value import in one of
      those modules stands out in review instead of hiding in a mixed
      declaration.

- [x] Move `src/` onto the `node:` import prefix
    - Built-in modules used to be imported both ways: 133 bare specifiers
      (`from 'fs'`, `'path'`, `'crypto'`, `'assert'`) across 90 files against
      the prefixed ones in the `gcal` subsystem, the demo helpers, the newer
      tests and `scripts/*.js`. The prefix rules out a `node_modules` package
      shadowing a built-in and resolves without the package lookup.
    - Deliberately not done before the release: the change touches most files
      and would have drowned the release diff in noise.
    - Done in one sweep over `src/`, plus `moveHeading.ts` folded from
      `import * as fs from 'fs'` + `fs.promises.*` into
      `import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises'`,
      as `utils/gcal/lock.ts` already did. `utils/extractor.ts` keeps its `fs`
      namespace import: it needs `readFileSync` and `fs.constants` as well.
    - Pinned by `no-restricted-imports` in `eslint.config.mjs`, which names
      every bare built-in specifier. That is a rule the linter already ships,
      unlike `n/prefer-node-protocol`
      ([eslint-plugin-n](https://github.com/eslint-community/eslint-plugin-n))
      or `unicorn/prefer-node-protocol`
      ([eslint-plugin-unicorn](https://github.com/sindresorhus/eslint-plugin-unicorn)),
      either of which would have meant a dev dependency and a rule set to tune
      for the one rule wanted. The restriction is repeated in the unit-test
      block: a rule configured twice is replaced, not merged, so leaving it out
      there would have let unit tests import `fs` bare again.

- [ ] TypeScript 6 -> 7 -- blocked on typescript-eslint, revisit at TS 7.1
    - The urgent part of the upgrade is already done: `moduleResolution:
node10`, which TypeScript 7 removes, was replaced by `node16` in both
      projects and `ignoreDeprecations` is gone, so the build no longer sits on
      a deprecation.
    - Tried on 7.0.2 (2026-07-26). The compiler is ready for this project:
      `tsc -b` builds it from a cleaned `out/` with no errors, all 730 unit and
      295 integration tests pass on that output, and the build takes 0.67 s
      against 7.29 s on TypeScript 6.
    - The linter is not. `eslint .` aborts before it reads a file with
      `Error: typescript-eslint does not support TS 7.0`, and the peer range of
      `typescript-eslint` 8.65.0 -- canary included -- is
      `typescript >=4.8.4 <6.1.0`.
    - The cause is not a missing version bump. TypeScript 7 no longer publishes
      the compiler as a JS library: the package has no `main`, its root export
      is `lib/version.cjs` (three lines returning the version string), the
      compiler ships as a native per-platform binary behind `bin/tsc`, and the
      programmatic surface sits behind `typescript/unstable/*`, where `Program`
      and `Checker` are clients of a separate compiler process rather than
      in-process objects. typescript-eslint needs the old in-process API, so
      support is
      [blocked by external API](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
      until that surface stabilises in TS 7.1; the 7.0.2 report
      ([#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518))
      was closed with "there is nothing we can do about this until TS 7
      provides an API".
    - Running both side by side (`tsc` from `@typescript/native`, `typescript`
      aliased to `@typescript/typescript6` so the linter keeps a TS 6 API, per
      the [7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/))
      is possible and is what other projects do, but it would make the fast
      compiler the authoritative gate while the two can still disagree, for a
      build that takes seven seconds. Not worth it here.
    - Revisit when typescript-eslint ships TS 7 support: bump `typescript`,
      re-run `npm run typecheck`, both test suites and a VSIX build.
    - Dependabot holds back `7.0.x` only (`.github/dependabot.yml`), so the
      first 7.1 release still arrives as a pull request -- that PR is the
      signal to redo the trial.

- [x] Ship third-party notices for the bundled extractor
    - The VSIX distributes `markdown-org-extract` as a statically linked
      binary; 81 crates are linked into it. All of them are permissive (no
      copyleft anywhere in the tree), but several carry an attribution clause
      that binary redistribution does not waive: BSD-2-Clause (comrak),
      BSD-3-Clause/WHATWG (encoding_rs, an `AND` component, so it stands
      regardless of the `MIT OR Apache-2.0` choice), the Unicode licences, and
      plain MIT.
    - Done in `markdown-org-extract` 0.11.1: it generates
      `THIRD-PARTY-LICENSES.txt` from its own dependency graph, ships it in
      every release archive, and gates the licence set with `cargo deny check
licenses` (its ADR-0024). Generation lives there rather than here
      because only that repository knows what is linked into the binary.
    - Here: `scripts/download-extractor.sh` unpacks it next to the binary as
      `bin/THIRD-PARTY-LICENSES.markdown-org-extract.txt` — beside
      `bin/LICENSE.markdown-org-extract`, since both describe the bundled
      binary and neither is authored in this repository — and the VSIX smoke
      test requires the path. No copy is kept in-tree: it would go stale the
      moment `x-markdown-org.extractorVersion` moves.
