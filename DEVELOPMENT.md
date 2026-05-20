# Development

This document is for contributors and developers building the
extension from source. End-user installation and feature documentation
live in [README.md](README.md).

## Table of Contents

- [Requirements](#requirements)
- [Build](#build)
- [Tests](#tests)
- [Lint and format](#lint-and-format)
- [Debug](#debug)
- [Install from source](#install-from-source)
- [Project Structure](#project-structure)
- [Additional documentation](#additional-documentation)
- [Release process](#release-process)
    - [Release commit form](#release-commit-form)
    - [Rolling back to a previous version](#rolling-back-to-a-previous-version)

## Requirements

- Node.js 22+ required (`engines.node` in `package.json`); CI and `.nvmrc` also use **Node 22** -- run `nvm use` to match.
- npm
- VS Code 1.85+
- For running integration tests on **headless Linux** (CI, remote machines without an X server): `xvfb-run` (e.g. `apt install xvfb`). Not required on macOS, Windows, or Linux with a graphical session.

## Build

```bash
npm install
npm run compile         # or `npm run watch` for incremental compilation
```

## Tests

```bash
npm test                # unit tests via Mocha (no VS Code host required)
npm run test:integration   # integration tests via @vscode/test-electron (downloads VS Code)
```

On headless Linux, prefix integration tests with `xvfb-run -a`. On macOS and Windows the integration runner uses the native display.

CI runs the full lint + unit + integration suite on Ubuntu, macOS, and Windows (`.github/workflows/ci.yml`). The release workflow re-runs the same matrix before packaging the VSIX.

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
installing it via [README > Installation > From
VSIX](README.md#from-vsix) avoids the symlink requirement entirely.

## Project Structure

```
src/
├── extension.ts              # Entry point, command registration
├── orgPatterns.ts            # Shared regex patterns (CLOCK, HEADING, TIMESTAMP)
├── types.ts                  # Shared types (Task, DayAgenda, FileTag, ...)
├── utils.ts                  # Top-level helpers (findNearestHeading, toIsoDate, ...)
├── utils/
│   ├── extractor.ts          # markdown-org-extract resolution + timeouts/maxBuffer
│   ├── exec.ts               # execFile wrapper (centralized for test stubbing)
│   ├── notify.ts             # Unified "Markdown Org: ..." user-facing messages
│   ├── tagFilter.ts          # File tag filter matching
│   ├── cycleTag.ts           # ALL <-> tag rotation
│   ├── blockDeletion.ts      # EOF-safe block deletion range math
│   ├── agendaClick.ts        # Click intent resolution in the agenda webview
│   ├── agendaScroll.ts       # Per-anchor scroll memory for the agenda
│   └── agendaHeadingTint.ts  # Heading class resolution (priority / DEADLINE)
├── commands/
│   ├── taskStatus.ts         # TODO/DONE + priority + SCHEDULED/DEADLINE/CREATED
│   ├── agenda.ts             # showAgenda(...), cycleTag, extractor invocation
│   ├── clock.ts              # CLOCK start/finish
│   ├── clocktable.ts         # Insert CLOCK Table
│   ├── timestampEdit.ts      # Shift+Up/Down editing
│   └── moveHeading.ts        # Move to Archive, Promote to Maintain
├── views/
│   └── agendaPanel.ts        # Webview for agenda/tasks display
└── test/
    ├── unit/                 # Mocha unit tests (*.test.ts, no VS Code host)
    ├── integration/          # @vscode/test-electron tests (*.integration.test.ts)
    └── suite/                # Mocha runners (index.ts, integration.ts)
```

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
distribution channel (GitHub Release / Marketplace) so new users don't
land on it; existing installs are still protected by the steps above.
