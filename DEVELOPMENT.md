# Development

This document is for contributors and developers building the
extension from source. End-user installation and feature documentation
live in [README.md](README.md).

## Table of Contents

- [Requirements](#requirements)
- [Build](#build)
- [Tests](#tests)
    - [Coverage](#coverage)
    - [Test-only hooks](#test-only-hooks)
- [Lint and format](#lint-and-format)
- [Debug](#debug)
- [Bundled extractor](#bundled-extractor)
- [Demo media](#demo-media)
- [Install from source](#install-from-source)
- [Project Structure](#project-structure)
- [Additional documentation](#additional-documentation)
- [Release process](#release-process)
    - [Steps and channels](#steps-and-channels)
    - [Release commit form](#release-commit-form)
    - [Rolling back to a previous version](#rolling-back-to-a-previous-version)

## Requirements

- Node.js 24+ required (`engines.node` in `package.json`); CI and `.nvmrc` also use **Node 24**, the active LTS line -- run `nvm use` to match. This is the build and test runtime only: the extension itself runs on the Node build inside VS Code's Electron.
- npm
- VS Code 1.85+
- For running integration tests on **Linux** (any session, graphical or headless): `xvfb-run` (e.g. `apt install xvfb`). The runner requires it and refuses the real display; see [Tests](#tests). Not needed on macOS or Windows.
- For recording the README media (Linux only): `Xvfb`, `ffmpeg`, `xdpyinfo`, `xdotool` (e.g. `apt install xvfb ffmpeg x11-utils xdotool`). Only needed when regenerating screenshots or demo recordings; see [Demo media](#demo-media).

## Build

```bash
npm install
npm run compile         # or `npm run watch` for incremental compilation
```

`npm run compile` is `tsc -b` over two projects:

| Project                 | Owns                                                                                 | Notable settings          |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------- |
| `tsconfig.json`         | the extension host -- commands, panel, utils, tests                                  | Node types, no DOM lib    |
| `tsconfig.webview.json` | the agenda page: `src/webview/**`, plus `src/types.ts` and `src/utils/agendaI18n.ts` | `lib: dom`, no Node types |

Both emit into `out/`, and the host resolves `src/webview/*` through the
declarations the webview project emits (hence `tsc -b`, which builds it first).
The split exists so the client can use DOM types while the host cannot; the
webview client is injected into the page as source text, so it must not import
anything at runtime. See [ADR-0012](docs/adr/0012-webview-client-as-a-typed-project.md).

## Tests

```bash
npm test                # unit tests via Mocha (no VS Code host required)
npm run test:integration   # integration tests via @vscode/test-electron (downloads VS Code)
```

`npm run test:integration` goes through `scripts/run-integration-tests.js`, which
starts the test VS Code under `xvfb-run` itself -- do not prefix the command by
hand. On Linux this is not limited to headless machines: a graphical session is
exactly the case the wrapper protects, since running on the real `$DISPLAY` pops
a live VS Code window mid-run. With `xvfb-run` missing the wrapper fails with an
explanatory error instead of falling back to the real display; the single
exception is CI, where the runner is headless. On macOS and Windows the runner
uses the native display.

CI runs the full lint + unit + integration suite on Ubuntu, macOS, and Windows (`.github/workflows/ci.yml`). The release workflow re-runs the same matrix before packaging the VSIX.

### Coverage

```bash
npm run test:coverage               # unit run, gated by .c8rc.json thresholds
npm run test:integration:coverage   # integration run, lcov into coverage/integration
npm run coverage:check:integration  # gate for the run above
```

The two runs are measured separately, because they reach different code and one
denominator would hide both. The unit profile (`.c8rc.json`) excludes what cannot
load without a VS Code host -- `out/extension.js`, `out/commands/**`,
`out/views/agendaPanel.js`, `out/diagnostics/**` and the few `vscode`-importing
utils -- so its threshold measures the pure modules it actually covers instead of
sinking every time the panel grows. Those excluded modules are covered by the
integration run, whose lcov is gated by `scripts/check-lcov-thresholds.js`
(`@vscode/test-cli` emits a report but has no threshold option of its own).

Not measured: `src/webview/agendaClient.ts` runs inside the webview, which
neither runner instruments. It is type-checked and linted like the rest of the
source, its helpers are unit-tested modules, and its output is asserted through
`AgendaPanel.queryRenderedInfoForTesting` in the integration suite. Both profiles
exclude it rather than carry it as a fixed low number: the integration report
used to show it at 20% of lines and 0% of functions -- the file being read for
inlining, not executed -- which was 13% of the denominator that no test could
move, in either direction. Excluding it raised the measured line coverage of the
host code from 72% to 80%, and the floors were raised to match.

### Test-only hooks

`AgendaPanel` carries a few hooks the integration suite needs and production
never calls: `queryRenderedInfoForTesting` (asks the page for a snapshot of what
it rendered -- the only seam into webview DOM), `__testGetCreateCount`,
`__testSetReadyTimeoutMs` and `__testSuppressNextReadies`. They only read state
or adjust timing, and the page answers `renderedInfo` solely when asked from
outside.

## Lint and format

```bash
npm run lint            # ESLint (flat config, eslint.config.mjs)
npm run lint:fix
npm run format          # Prettier
npm run format:check
```

## Debug

1. Open project in VS Code
2. Press `F5` or `Run > Start Debugging`
3. A new VS Code window opens with the extension installed
4. Open any `.md` file and test commands

**Debug tips:**

- Breakpoints work in `.ts` files in `src/` folder
- Debug console shows `console.log()` output
- Press `Ctrl+Shift+F5` to restart after code changes

## Bundled extractor

The VSIX ships `markdown-org-extract` as a binary, downloaded at packaging time
by `scripts/download-extractor.sh` from the release named in
`x-markdown-org.extractorVersion`. Two things pin what gets installed:

- **the version**, which selects the release, and
- **`x-markdown-org.extractorSha256`**, one sha256 per Rust target, checked
  after the download.

The upstream `.sha256` file sits in the same release as the archive, so it only
proves the transfer was intact; the pin in this repository is what makes a
swapped release asset a build failure rather than a silent substitution.

Raising the version therefore means updating both. The script prints the hash it
saw when a pin is missing or does not match, which is the value to paste in
after checking that the release is the intended one:

```bash
bash scripts/download-extractor.sh linux-x64   # prints the actual sha256 on mismatch
```

## Demo media

The screenshots and demo recordings in the README are generated, not taken by
hand: a scenario runs as an integration test inside a VS Code launched on a
virtual X server, and the driver records it. Anyone changing the interface is
expected to regenerate the affected assets.

```bash
node scripts/screenshot-demo.js            # both themes
node scripts/screenshot-demo.js dark       # one theme only
node scripts/record-demo.js all            # every scenario, both themes
node scripts/record-demo.js agenda light   # one scenario, one theme
```

Both drivers record **both themes by default** -- Monokai for the dark set,
Solarized Light for the light one (both built into VS Code) -- and the theme
becomes the file-name suffix (`-dark` / `-light`), which is what the README's
`<picture>` elements switch between. Output goes to `media/`.

The drivers check for their binaries up front (see
[Requirements](#requirements)) and stop with a clear message when one is
missing. Linux only: they start their own `Xvfb`.

## Install from source

Use the symlink approach to run the latest local checkout as an
installed VS Code extension without packaging a VSIX.

**macOS / Linux:**

```bash
npm install
npm run compile
ln -s "$(pwd)" "$HOME/.vscode/extensions/markdown-org-vscode"
```

**Windows (PowerShell):**

```powershell
npm install
npm run compile
# Requires Developer Mode (Settings > Privacy & security > For developers)
# or an elevated PowerShell session.
New-Item -ItemType SymbolicLink `
    -Path "$env:USERPROFILE\.vscode\extensions\markdown-org-vscode" `
    -Target $PWD.Path
```

Then reload the VS Code window (`Ctrl+Shift+P` -> `Developer: Reload
Window`). On Windows, building a VSIX (`npm run package`) and
installing it via [README > Quick Start](README.md#quick-start) avoids
the symlink requirement entirely.

## Project Structure

Described by directory rather than file by file: `src/utils/` alone holds around
fifty modules, and a hand-maintained listing goes stale on every addition.

```
src/
├── extension.ts              # Entry point, command registration
├── orgPatterns.ts            # Shared regex patterns (CLOCK, HEADING, TIMESTAMP)
├── types.ts                  # Shared types (Task, DayAgenda, FileTag, ...)
├── utils.ts                  # Top-level helpers (findNearestHeading, toIsoDate, ...)
├── utils/                    # Pure, unit-tested helpers -- no vscode import unless named below
│   ├── agenda*.ts            # Agenda rendering logic: click intent, scroll memory, day
│   │                         # headers, sections, task groups, month cells, tooltips, i18n
│   ├── gcal/                 # Google Calendar client, mapping and sync state
│   ├── extractor.ts, exec.ts # markdown-org-extract resolution and the execFile wrapper
│   │                         # (centralised so tests can stub one place)
│   ├── notify.ts, logChannel.ts  # User-facing messages, and the "Markdown Org" output channel
│   └── ...                   # Timestamps, CLOCK maths, tag filtering, config access
├── commands/                 # One module per command group: task status, timestamps, CLOCK,
│                             # clock table, heading moves, agenda, Google Calendar sync
├── diagnostics/              # Bracket-policy diagnostics and their Quick Fixes (ADR-0014)
├── views/
│   ├── agendaPanel.ts        # Host side of the agenda webview (panel, messages, HTML shell)
│   └── agendaStyles.ts       # The agenda stylesheet (vscode-free, so unit tests assert on it)
├── webview/
│   └── agendaClient.ts       # Code that runs INSIDE the agenda page (own tsconfig, DOM lib)
└── test/
    ├── unit/                 # Mocha unit tests (*.test.ts, no VS Code host)
    ├── integration/          # @vscode/test-electron tests (*.integration.test.ts)
    └── demo/                 # Scripted runs that drive the UI for the README media
                              # (*.demo.test.ts, captured under Xvfb -- see below)
```

A module in `src/utils/` is expected to be free of `vscode` imports so it can be
unit-tested without the editor host; the exceptions (config access, notifications,
the output channel, the Google Calendar client) are the ones that wrap the API on
purpose.

## Additional documentation

Internal design notes and testing playbooks live in `docs/`; example
markdown files used by manual testing live in `examples/`:

- [`docs/adr/`](docs/adr/) -- Architecture Decision Records (why the project looks the way it does)
- [`docs/clock-implementation.md`](docs/clock-implementation.md) -- CLOCK feature design notes
- [`docs/clock-testing.md`](docs/clock-testing.md) -- manual CLOCK test plan
- [`docs/clock-usage.md`](docs/clock-usage.md) -- CLOCK end-user reference
- [`docs/holidays-integration.md`](docs/holidays-integration.md) -- how the extractor supplies holiday dates
- [`docs/month-view-changes.md`](docs/month-view-changes.md) -- month-calendar implementation notes
- [`docs/month-view-tests.md`](docs/month-view-tests.md) -- month-view test scenarios
- [`TAG_FILTERING.md`](TAG_FILTERING.md) -- user-facing tag filter reference (linked from the main flow above)
- [`TODO.md`](TODO.md) -- internal backlog
- [`examples/`](examples/) -- demo markdown files for manual smoke-testing

## Release process

Per-version changes are tracked in [`CHANGELOG.md`](CHANGELOG.md) using
the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

### Steps and channels

1. Rename the `## [Unreleased]` CHANGELOG section to `## [X.Y.Z] - <date>`,
   add the link definition at the bottom of the file, and bump `version` in
   `package.json` -- both in the same [release commit](#release-commit-form).
2. Create the annotated tag `vX.Y.Z` on that commit and push it. The tag is
   what triggers `.github/workflows/release.yml`.
3. The workflow runs the full lint + unit + integration matrix, validates the
   tag (annotated, version matches `package.json`, CHANGELOG section present),
   builds four platform VSIX files (`linux-x64`, `darwin-x64`, `darwin-arm64`,
   `win32-x64`), each with the matching prebuilt extractor binary inside, and
   checks each package before publishing (valid zip, required and forbidden
   paths, version inside the package, non-zero size).
4. Publication targets are **GitHub Releases** (all four VSIX files, with the
   CHANGELOG section as the release body) and **Open VSX**
   (`ovsx publish --skip-duplicate`). The VS Code Marketplace is deliberately
   not a target -- see [ADR-0004](docs/adr/0004-open-vsx-distribution.md).

### Release commit form

The version bump itself ships as a single commit whose subject follows
the form `chore(release): vX.Y.Z`. That commit updates `package.json`
(and any other version-pinning file) and adds the matching CHANGELOG
section; the annotated tag `vX.Y.Z` is then created on the same commit
to trigger the publish workflow. The Conventional Commits scope keeps
release commits easy to filter (`git log --grep '^chore(release)'`)
without claiming a behaviour change those commits never carry.

### Rolling back to a previous version

If a release introduces a regression, you can pin the extension to the
previous good build without waiting for a forward fix:

1. Open the **GitHub Releases** page and download the `.vsix` for the
   last known good version.
2. In VS Code, open the **Extensions** view, click the `...` menu next
   to the search box, choose **Install from VSIX...**, and select the
   downloaded file. VS Code will replace the current install with that
   version.
3. To stop auto-updates from pulling the broken version back in, right-
   click the extension entry and choose **Pin Version**.

After the regression is fixed in a later release, unpin the version
and let VS Code resume normal updates.

If the issue is severe enough that the broken release should not be
installed by anyone, also unpublish or yank the offending tag from the
distribution channel (GitHub Release / Open VSX) so new users don't
land on it; existing installs are still protected by the steps above.
