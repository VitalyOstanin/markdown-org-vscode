# TODO

## Table of Contents

- [Design](#design)
- [Configuration](#configuration)
- [Publishing](#publishing)
- [Documentation](#documentation)
- [Testing](#testing)

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
- [ ] Measure coverage of the code that runs inside the agenda page
    - `src/webview/agendaClient.ts` is type-checked and linted like the rest of
      the source (ADR-0012), but no coverage number covers it: c8 measures the
      extension host, and the client runs in the webview, which neither runner
      instruments. It is excluded from the unit profile so it does not sit in
      the denominator as a permanent zero.
    - What holds it today: the helpers it is handed are unit-tested modules, and
      its observable output is asserted through `queryRenderedInfoForTesting` in
      the integration suite.
    - Options to explore: keep extracting page logic into `src/utils/` modules
      with jsdom unit tests (the established route), or collect V8 coverage from
      the webview process and merge it into the report.

- [ ] Turn on the remaining strict TypeScript options
    - `noImplicitOverride` is on (it cost nothing). Two are left, both needing
      code changes: `exactOptionalPropertyTypes` (~40 errors, mostly optional
      fields passed through as `T | undefined`) and `noUncheckedIndexedAccess`
      (~216, a large share of them indexed access in tests).
    - Take them one at a time, starting with `exactOptionalPropertyTypes`.

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
