# Markdown Org

[![CI](https://github.com/VitalyOstanin/markdown-org-vscode/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/VitalyOstanin/markdown-org-vscode/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/VitalyOstanin/markdown-org-vscode/branch/master/graph/badge.svg)](https://codecov.io/gh/VitalyOstanin/markdown-org-vscode)
[![Open VSX](https://img.shields.io/open-vsx/v/vitalyostanin/markdown-org-vscode?label=Open%20VSX)](https://open-vsx.org/extension/vitalyostanin/markdown-org-vscode)

Org-mode style task management in Markdown -- TODO/DONE workflow,
priorities, SCHEDULED/DEADLINE timestamps, day/week/month agenda views,
CLOCK time tracking, and **one-way [Google Calendar sync](#google-calendar-sync)**
of scheduled tasks. Everything lives in plain `.md` files, so your tasks
travel with the repository.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-agenda-dark.gif">
    <img src="media/demo-agenda-light.gif" alt="Day / Week / Month agenda demo">
</picture>

The extension is one of two projects reading the same files:

| Project                                                                         | What it is                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `markdown-org-vscode` (this one)                                                | the VS Code extension: agenda panel, editing commands, time tracking    |
| [`markdown-org-extract`](https://github.com/VitalyOstanin/markdown-org-extract) | the CLI and Rust library the extension runs to read tasks out of a file |

Everything the agenda shows is read by the extractor, so a file means the same
thing to anything else that links it.

## Table of Contents

- [Features](#features)
    - [Google Calendar sync (new)](#google-calendar-sync-new)
    - [Core](#core)
- [Quick Start](#quick-start)
- [Syntax Examples](#syntax-examples)
    - [Task Statuses](#task-statuses)
    - [Timestamps](#timestamps)
        - [Active and inactive forms](#active-and-inactive-forms)
    - [CLOCK Entries](#clock-entries)
    - [Priority Levels](#priority-levels)
    - [Repeating Tasks](#repeating-tasks)
- [Writing a task by saying it](#writing-a-task-by-saying-it)
- [Commands](#commands)
    - [Task Status Commands](#task-status-commands)
    - [Phrase Commands](#phrase-commands)
    - [Timestamp Commands](#timestamp-commands)
    - [CLOCK Commands](#clock-commands)
    - [Agenda Commands](#agenda-commands)
    - [Shadowed VS Code chords](#shadowed-vs-code-chords)
    - [Heading Management Commands](#heading-management-commands)
        - [Migrating into a maintain file with **Promote to Maintain**](#migrating-into-a-maintain-file-with-promote-to-maintain)
    - [Google Calendar Commands](#google-calendar-commands)
- [Settings](#settings)
    - [`markdown-org.extractorPath`](#markdown-orgextractorpath)
    - [`markdown-org.workspaceDir`](#markdown-orgworkspacedir)
    - [`markdown-org.workspaceDirs`](#markdown-orgworkspacedirs)
    - [`markdown-org.maintainFilePath`](#markdown-orgmaintainfilepath)
    - [`markdown-org.dateLocale`](#markdown-orgdatelocale)
    - [`markdown-org.uiLanguage`](#markdown-orguilanguage)
    - [`markdown-org.highlightInEditor`](#markdown-orghighlightineditor)
    - [`markdown-org.firstDayOfWeek`](#markdown-orgfirstdayofweek)
    - [`markdown-org.fileTags`](#markdown-orgfiletags)
    - [`markdown-org.currentTag`](#markdown-orgcurrenttag)
    - [`markdown-org.agendaFontFamily`](#markdown-orgagendafontfamily)
    - [`markdown-org.agendaHeaderMode`](#markdown-orgagendaheadermode)
    - [`markdown-org.agendaGrouping`](#markdown-orgagendagrouping)
    - [`markdown-org.clockRoundMinutes`](#markdown-orgclockroundminutes)
    - [`markdown-org.weekdayLocale`](#markdown-orgweekdaylocale)
    - [`markdown-org.gcalSync.clientId`](#markdown-orggcalsyncclientid)
- [Workspace Trust](#workspace-trust)
- [Google Calendar Sync](#google-calendar-sync)
- [Dependencies](#dependencies)
- [Development](#development)
- [Release notes](#release-notes)
- [License](#license)

## Features

Brings the [Org mode](https://orgmode.org/) task management workflow
to Markdown files in VS Code.

### Google Calendar sync (new)

**Opt-in, one-way push of `SCHEDULED` / `DEADLINE` tasks to your own
Google Calendar.** Connect with your OAuth Desktop client (refresh
token stays in the OS keychain via VS Code's `SecretStorage`), pick the
target calendar, then **Sync Now** on demand or enable debounced
**sync on save**. Marking a task DONE deletes its event (configurable);
re-opening it (DONE → TODO) revives the event instead of leaving an
orphan. Property write-back (`ID` / `GCAL_EVENT_ID`) is conflict-safe.
See the full [Google Calendar Sync](#google-calendar-sync) section with
connect / select / sync demos and [ADR-0010](docs/adr/0010-google-calendar-sync.md).

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-gcal-sync-dark.gif">
    <img src="media/demo-gcal-sync-light.gif" alt="Sync Now: spinner, summary, and the per-event details channel">
</picture>

### Core

- **Task management** -- TODO / DONE / CANCELLED statuses with priorities (`[#A]` -- `[#Z]` or numeric `[#0]` -- `[#64]`), the whole range reachable from `Set Priority`: a shortlist of letters, a field for any other value, and an entry that clears the cookie. A CANCELLED task (both spellings `CANCELLED` and `CANCELED` are recognised) renders struck-through in the agenda and is excluded from Google Calendar sync -- its event is deleted if it had one.
- **Timestamps** -- `CREATED`, `SCHEDULED`, `DEADLINE`, `CLOSED` and the keyword-less one, with full date / time, in both active `<...>` and inactive `[...]` forms per [ADR-0005](docs/adr/0005-active-and-inactive-timestamps.md). A keyword-less timestamp is the appointment rather than a date somebody owes, which is what tells the two apart in the agenda: write a recurring appointment as `` `<2025-09-01 Mon 19:00 +1w>` `` and a recurring obligation as `SCHEDULED:` with `++1w`.
- **Repeating tasks** -- Org-mode repeaters `+1d`, `+1w`, `+1m`, `.+1m`, `++1w`, and `+1wd` for workdays (skips weekends and Russian holidays). Marking such a task DONE moves it to its next occurrence and leaves it open, as Emacs does: `+N` takes one step, `++N` steps until it passes today, `.+N` restarts from today ([ADR-0017](docs/adr/0017-repeating-tasks-move-on-done.md)). A `wd` repeater is the exception -- the editor says so instead of moving it, because the working calendar it would need is not published by the extractor. In the agenda, the repeat glyph on a row drawn under a day names the occurrence after _that_ day, so a daily task reads on in the week rather than repeating tomorrow's date on every row; a row borrowed into today -- overdue, or a deadline coming due -- names the next occurrence from today.
- **CLOCK entries** -- Time tracking with start / finish events and an aggregated CLOCK table per file.
- **A task said in one sentence** -- `Insert Task from Phrase` takes "позвонить врачу завтра в 15:00, каждую неделю" and writes the heading, the keyword, the priority and the planning line under it. The rules are the extractor's, so the editor and the Android client read a phrase the same way, and a second phrase refines the first rather than starting over. Nothing is written until Enter on an empty box; see [Writing a task by saying it](#writing-a-task-by-saying-it).
- **Agenda views** -- Day, Week, Month and Tasks. Day and Tasks are cards (a sticky summary bar plus sections by time of day or by priority), the week groups overdue, scheduled and upcoming tasks under sticky day headers, and the month calendar shows a count of what is dated to each day, turning red on a day that has gone by with planning still on it and ringed on a day a deadline is coming due on. A press on a section head folds it: the rows go, the heading keeps its count, and a second press brings them back — a band folded in the week is folded on every day of it, and the fold lasts as long as the panel is open. Views keep a browser-style history you can step through with the Back / Forward commands. In the week, a day header whose rows do not all fit shows how many are out of sight -- `↑ N` behind the pinned header, `↓ M` below the bottom of the panel -- so a day that continues past the edge is never mistaken for a short one. A row counts once less than half of it is visible, which is where its text stops being readable. `Ctrl+F` opens the editor's find widget over the panel, so a task is reached by its title instead of by scrolling; `F3` and `Shift+F3` step through the matches from anywhere in the panel, and reopen a widget that was dismissed. The search reads what is rendered, so unfold a band before searching inside it.
- **Editor colouring** -- Planning keywords, the parts of a timestamp (date, weekday, time, repeater, warning cookie), status keywords and the `[#A]` / `[#B]` / `[#C]` cookies are coloured in markdown editors, in the same colours the agenda uses for the same things. It works at any indentation, including the four spaces that make markdown treat a line as a code block and stop highlighting it -- the indentation the extractor reads without complaint. Turn it off with [`markdown-org.highlightInEditor`](#markdown-orghighlightineditor).
- **Interface language** -- The agenda panel speaks English or Russian, following [`markdown-org.uiLanguage`](#markdown-orguilanguage); by default it follows the date locale, then the VS Code display language.
- **Tag filtering** -- Filter agenda by file-name patterns (e.g. `WORK` / `PRIVATE`), toggled from the agenda or by hotkey.
- **Git status of the source files** -- A chip in the agenda header counts the files of the current view by state -- unresolved conflicts (`!`), uncommitted changes (`●`), files touched by unpushed commits (`↑`), and files whose state could not be read at all (`?`) -- or says `✓ clean` when there is nothing to report. It expands to the list behind those numbers, grouped by the same states, and to the commits a push would send. Commit (only the view's changed files, never unrelated edits in the same repository), push and sync run from the same dropdown; a merge left unresolved takes the commit button away until it is settled in Source Control. Sync is the exchange in one press -- fetch, fast-forward a branch that is only behind, push one that is only ahead -- and it leaves a branch that has diverged exactly as it stands, naming it, because merging is a decision made in Source Control. Files reached through a symlink resolve to the repository behind them, including one outside the open workspace folders. Needs no setting and no configuration: the chip appears whenever the built-in Git extension is available -- a file outside git is one of the states it reports, not a reason to hide it. See [ADR-0016](docs/adr/0016-git-status-via-git-extension-api.md), [ADR-0020](docs/adr/0020-panel-does-not-resolve-conflicts.md) and [ADR-0022](docs/adr/0022-the-panel-syncs-but-never-merges.md).
- **Live updates** -- Agenda refreshes automatically when underlying markdown files change.
- **Heading management** -- Archive completed tasks to `*.archive.md` or promote them to a maintenance file.
- **Properties** -- A per-task properties block: a fenced code block with the info string `org-properties` holding `KEY: value` lines, placed under the heading and its planning lines. It round-trips through markdown viewers as a folded block. See [ADR-0009](docs/adr/0009-task-properties-org-properties-block.md).

## Quick Start

Requires VS Code 1.101 or newer (see
[ADR-0018](docs/adr/0018-minimum-host-follows-the-git-api.md)). The
extension bundles a prebuilt `markdown-org-extract` binary inside the
VSIX, so there is nothing to install separately. Pick the install
channel that matches your editor:

- **VSCodium / Cursor / Gitpod / code-server (Open VSX registry):**

    ```bash
    code --install-extension vitalyostanin.markdown-org-vscode
    ```

    Or browse the extension page on
    [Open VSX](https://open-vsx.org/extension/vitalyostanin/markdown-org-vscode).

- **VS Code (Microsoft Marketplace is intentionally not used -- see
  [ADR-0004](docs/adr/0004-open-vsx-distribution.md)):** download the
  platform-specific `markdown-org-vscode-X.Y.Z-<platform>.vsix` from
  [GitHub Releases](https://github.com/VitalyOstanin/markdown-org-vscode/releases)
  (e.g. `linux-x64`, `darwin-arm64`, `win32-x64`) and install it:
    - **GUI:** open the **Extensions** view (`Ctrl+Shift+X`), click the
      `...` menu next to the search box, choose **Install from VSIX...**,
      and select the downloaded file.
    - **CLI:**

        ```bash
        code --install-extension markdown-org-vscode-X.Y.Z-<platform>.vsix
        ```

Open any `.md` file in your workspace and start using the
[commands](#commands). For building the extension from source or
running with a custom `markdown-org-extract` build, see
[DEVELOPMENT.md](DEVELOPMENT.md) and
[`markdown-org.extractorPath`](#markdown-orgextractorpath).

## Syntax Examples

The extension reads tasks directly from your Markdown -- headings
become tasks, inline code spans hold timestamps:

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/editor-markdown-dark.png">
    <img src="media/editor-markdown-light.png" alt="Editor view of a planning file">
</picture>

### Task Statuses

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-task-status-dark.gif">
    <img src="media/demo-task-status-light.gif" alt="TODO / priority / DONE / CANCELLED workflow">
</picture>

```markdown
## TODO Task without priority

## TODO [#A] High priority task

## DONE Completed task

## CANCELLED Abandoned task

## Regular heading without status
```

Both spellings of the cancelled keyword are recognised on read --
`CANCELLED` (the common convention) and `CANCELED` (the Org manual's
single-`L` form); `Set CANCELLED` writes `CANCELLED`. A cancelled task is
shown struck-through in the agenda and is never pushed to Google Calendar
(any event it already had is deleted).

### Timestamps

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-timestamps-dark.gif">
    <img src="media/demo-timestamps-light.gif" alt="All four timestamp types and three repeater flavours">
</picture>

**With tasks:**

```markdown
## TODO [#A] Important meeting
`CREATED: [2025-12-01 Sun 09:15]`
`DEADLINE: <2025-12-06 Fri 15:00>`
```

**Completed task:**

```markdown
## DONE Fix bug in parser
`CREATED: [2025-12-01 Sun 10:00]`
`CLOSED: [2025-12-03 Tue 14:30]`
```

**Without tasks (standalone timestamps):**

```markdown
## Project planning session
`SCHEDULED: <2025-12-10 Tue 10:00>`

## Report submission
`DEADLINE: <2025-12-15 Sun>`
```

#### Active and inactive forms

Org-mode distinguishes two bracket forms for timestamps; the editor
follows the per-keyword policy defined in
[ADR-0005](docs/adr/0005-active-and-inactive-timestamps.md):

| Keyword      | Bracket form       | Rationale                                                                 |
| ------------ | ------------------ | ------------------------------------------------------------------------- |
| `SCHEDULED:` | `<...>`            | Drives agenda windows; must be active.                                    |
| `DEADLINE:`  | `<...>`            | Drives agenda windows; must be active.                                    |
| `CLOSED:`    | `[...]`            | Descriptive completion stamp; matches Emacs `org-todo`.                   |
| `CREATED:`   | `[...]`            | Descriptive metadata; matches Emacs `org-expiry`.                         |
| Inline plain | `<...>` or `[...]` | Either form; active is agenda-relevant, inactive is descriptive metadata. |
| `CLOCK:`     | `<...>` or `[...]` | Either form is accepted on read; the editor writes `[...]`.               |

A keyword line whose bracket form does not match the table -- for
example `CLOSED: <2025-12-03 Tue>` or a mixed pair like
`<2025-12-03 Tue]` -- is surfaced as a warning under the
`markdown-org` diagnostic source. Press `Ctrl+.` on the warning to
apply the **Convert to canonical bracket form** Quick Fix.

To flip a bare inline timestamp between `<...>` and `[...]`, run
`Markdown Org: Toggle Timestamp Active/Inactive` from the Command
Palette. The command refuses on keyword lines (the keyword binds the
bracket form); use `Shift+Up` / `Shift+Down` to cycle the keyword
instead. See [ADR-0006](docs/adr/0006-bracket-toggle-keybindings.md)
for the UX rationale and the deliberate asymmetry with Emacs
`org-toggle-timestamp-type`.

### CLOCK Entries

CLOCK entries track time spent on tasks. They can be open (running)
or closed (with duration).

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-clock-dark.gif">
    <img src="media/demo-clock-light.gif" alt="CLOCK history, new entry, and clocktable">
</picture>

**Open CLOCK (running):**

```markdown
## TODO Working on feature
`CREATED: [2025-12-09 Tue 10:00]`
`CLOCK: [2025-12-09 Tue 14:30]`
```

**Closed CLOCK (with duration):**

```markdown
## TODO Code review
`CREATED: [2025-12-09 Tue 09:00]`
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] =>  1:30`
`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 16:00] =>  2:00`
```

Use **Insert CLOCK Table** to produce an aggregated table of CLOCK
durations for the current file:

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/clocktable-dark.png">
    <img src="media/clocktable-light.png" alt="Aggregated CLOCK table">
</picture>

### Priority Levels

Priority markers can be either a letter `A` -- `Z` or a number
`0` -- `64`:

```markdown
## TODO [#A] High priority task

## TODO [#B] Medium priority task

## TODO [#C] Low priority task

## TODO [#0] Highest numeric priority

## TODO [#64] Lowest numeric priority
```

Tasks with priority are shown first in the agenda, sorted ascending
(A before B before C; 0 before 1 before 2).

### Repeating Tasks

Timestamps support Org-mode repeater syntax for recurring tasks. The
weekday and repeater always live **inside** the angle brackets.

**Standard units:**

| Repeater | Meaning                                             |
| -------- | --------------------------------------------------- |
| `+Nh`    | Every N hours (see the note below)                  |
| `+Nd`    | Every N days                                        |
| `+Nw`    | Every N weeks                                       |
| `+Nm`    | Every N months                                      |
| `+Ny`    | Every N years                                       |
| `+Nwd`   | Every N **workdays** (skips weekends + RU holidays) |

**Hourly repeaters in the agenda.** The agenda is a day grid, so
`markdown-org-extract` projects an hour repeater onto it: every day counts as
one occurrence and **N is ignored** -- `+5h` behaves like `+1h`. Google Calendar
sync is not bound by that grid and maps the same repeater to
`FREQ=HOURLY;INTERVAL=N`.

**Repeater modifiers:**

| Prefix | Behaviour                                |
| ------ | ---------------------------------------- |
| `+`    | Cumulative (strict) -- preserves overdue |
| `++`   | Catch-up -- preserves day of week        |
| `.+`   | Restart -- counts from completion date   |

**Examples:**

```markdown
## TODO Daily standup
`SCHEDULED: <2026-12-06 Sun 10:00 +1d>`

## TODO Weekly review
`SCHEDULED: <2026-12-06 Sun ++1w>`

## TODO Every 2 workdays
`SCHEDULED: <2026-12-06 Sun +2wd>`
```

## Writing a task by saying it

A task is a heading with a keyword, sometimes a priority cookie, and a planning
line under it carrying a date, an hour and a repeater. Typed by hand that is
half a dozen commands; said in one sentence it is one:

```
Ctrl+K Ctrl+N   →   позвонить врачу завтра в 15:00, каждую неделю
```

```markdown
### TODO позвонить врачу
    `SCHEDULED: <2026-09-01 Вт 15:00 +1w>`
```

The rules that read the sentence are the extractor's (`parse-phrase`, 0.20.0),
so this extension and the Android client understand a phrase the same way, and
both grammars — Russian and English — are consulted whatever language the
editor is set to. What the rules understand, and what they do not, is the
[extractor's own table](https://github.com/VitalyOstanin/markdown-org-extract#what-the-rules-understand).

| №   | What                        | How it behaves                                                                                              |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | The box after a phrase      | Reopens with the lines that would be written in its title, so the fields are seen before the file gets them |
| 2   | Another phrase              | Refines the first: "в 16:00" moves the hour and leaves the day and the repeater alone                       |
| 3   | Enter on an empty box       | Writes the entry; Escape leaves the file untouched                                                          |
| 4   | Where the entry goes        | Into the note the cursor stands in, one level deeper, after everything already under it                     |
| 5   | A file with no heading      | The entry is written at the cursor, as a top-level heading                                                  |
| 6   | A phrase with no date in it | A heading and the creation mark — a task for the Tasks view                                                 |
| 7   | What the rules did not read | Stays in the heading; nothing said is dropped, only unsorted                                                |
| 8   | A muted microphone          | Named under the box, before every phrase: a sentence said into a muted input is never heard                 |

The phrase is meant to be said rather than typed, and a speech extension hears
nothing from a muted microphone while showing every sign of listening. The
mixer is asked before each box, and a muted input is named under it — nothing
is switched on for you. The question goes to `pactl`, which answers for
PulseAudio and PipeWire alike; where there is no answer to be had, on Windows
and macOS, the box reads as it always did.

Every entry written this way carries the moment it was written at —
`CREATED: [2026-09-01 вт 14:01]` under the heading, above the planning line, in
the inactive brackets the agenda never reads as a date to keep. To the minute,
which is what tells two entries written the same day apart; the Android client
marks an entry the same way. `Insert Created Timestamp` stays for entries typed
by hand.

The weekday in the timestamp follows `markdown-org.weekdayLocale`, and the box
speaks the language `markdown-org.uiLanguage` resolved to. The entry is written
into the open document, so one Undo takes it back. The decisions are in
[ADR-0023](docs/adr/0023-a-task-is-written-by-saying-it.md),
[ADR-0024](docs/adr/0024-an-entry-carries-the-moment-it-was-written-at.md) and
[ADR-0025](docs/adr/0025-the-phrase-box-names-a-muted-microphone.md).

## Commands

Hotkeys below match the bindings declared in `package.json`. They are
active while a Markdown editor has focus, with three exceptions: the
four `Show Agenda …` / `Show Tasks` commands also work while the agenda
panel has focus, the agenda history commands work only there, and
`Cycle Tag Filter` works in both places -- a Markdown editor or the
agenda panel.

On macOS every `Ctrl+K …` chord uses `Cmd` instead, e.g. `Cmd+K Cmd+T`
for `Set TODO` (the `Shift+Up`/`Shift+Down` bindings are unchanged).

### Task Status Commands

| Command                         | Hotkey                | Description                                             |
| ------------------------------- | --------------------- | ------------------------------------------------------- |
| `Markdown Org: Set TODO`        | `Ctrl+K Ctrl+T`       | Mark heading as TODO                                    |
| `Markdown Org: Set DONE`        | `Ctrl+K Ctrl+D`       | Mark heading as DONE                                    |
| `Markdown Org: Set CANCELLED`   | `Ctrl+K Ctrl+X`       | Mark heading as CANCELLED (repeat to clear)             |
| `Markdown Org: Toggle Priority` | `Ctrl+K Ctrl+P`       | Toggle priority: none → [#A] → none                     |
| `Markdown Org: Set Priority`    | `Ctrl+K Ctrl+Shift+P` | Pick the priority: a letter A–Z, a number 0–64, or none |

### Phrase Commands

| Command                                 | Hotkey          | Description                                                                                                             |
| --------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Markdown Org: Insert Task from Phrase` | `Ctrl+K Ctrl+N` | Say the task in one sentence; the entry joins the note the cursor stands in (see [above](#writing-a-task-by-saying-it)) |

### Timestamp Commands

| Command                                          | Hotkey                 | Description                                                                                                                                            |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Markdown Org: Insert CREATED Timestamp`         | `Ctrl+K Ctrl+K Ctrl+C` | Insert CREATED timestamp under the heading (inactive `[...]` form)                                                                                     |
| `Markdown Org: Insert SCHEDULED Timestamp`       | `Ctrl+K Ctrl+K Ctrl+S` | Insert SCHEDULED timestamp; repeating the command removes it (toggle off)                                                                              |
| `Markdown Org: Insert DEADLINE Timestamp`        | `Ctrl+K Ctrl+K Ctrl+D` | Insert DEADLINE timestamp; repeating the command removes it (toggle off)                                                                               |
| `Markdown Org: Insert Timestamp (no keyword)`    | `Ctrl+K Ctrl+K Ctrl+I` | Insert a plain timestamp -- the appointment rather than a planning date; repeating the command removes it (toggle off)                                 |
| `Markdown Org: Timestamp Up`                     | `Shift+Up`             | Increment date / time / task status / timestamp type under cursor; with a non-adjustable caret or an active selection, extends the selection as usual  |
| `Markdown Org: Timestamp Down`                   | `Shift+Down`           | Decrement date / time / task status / timestamp type under cursor; with a non-adjustable caret or an active selection, extends the selection as usual  |
| `Markdown Org: Toggle Timestamp Active/Inactive` | -                      | Flip `<...>` ↔ `[...]` on a bare inline timestamp under the cursor (Command Palette only; see [ADR-0006](docs/adr/0006-bracket-toggle-keybindings.md)) |

### CLOCK Commands

| Command                             | Hotkey                 | Description                                           |
| ----------------------------------- | ---------------------- | ----------------------------------------------------- |
| `Markdown Org: Insert CLOCK Start`  | `Ctrl+K Ctrl+C Ctrl+S` | Start a new CLOCK entry (opens timer)                 |
| `Markdown Org: Insert CLOCK Finish` | `Ctrl+K Ctrl+C Ctrl+F` | Close the open CLOCK entry and calculate its duration |
| `Markdown Org: Insert CLOCK Table`  | `Ctrl+K Ctrl+C Ctrl+V` | Insert an aggregated CLOCK table for the current file |

### Agenda Commands

| Command                                    | Hotkey                 | Description                                                             |
| ------------------------------------------ | ---------------------- | ----------------------------------------------------------------------- |
| `Markdown Org: Show Agenda (Day)`          | `Ctrl+K Ctrl+K Ctrl+Y` | Show today's tasks                                                      |
| `Markdown Org: Show Agenda (Week)`         | `Ctrl+K Ctrl+K Ctrl+W` | Show this week's tasks                                                  |
| `Markdown Org: Show Agenda (Month)`        | `Ctrl+K Ctrl+K Ctrl+M` | Show this month's tasks                                                 |
| `Markdown Org: Show Tasks`                 | `Ctrl+K Ctrl+K Ctrl+L` | Show all TODO tasks grouped by priority                                 |
| `Markdown Org: Go Back in Agenda`          | `Alt+Shift+-`          | Return to the previously shown agenda view                              |
| `Markdown Org: Go Forward in Agenda`       | `Alt+Shift+=`          | Step forward again after going back                                     |
| `Markdown Org: Find Next in Agenda`        | `F3`                   | Next match of the panel's find widget, reopening it if it was dismissed |
| `Markdown Org: Find Previous in Agenda`    | `Shift+F3`             | Previous match of the panel's find widget                               |
| `Markdown Org: Cycle Tag Filter`           | `Ctrl+K Ctrl+K Ctrl+T` | Cycle the active file tag filter (e.g. ALL/WORK/PRIVATE)                |
| `Markdown Org: Cycle Agenda Header Layout` | --                     | Step the header layout: auto -> full -> compact                         |
| `Markdown Org: Toggle Agenda Day Sections` | --                     | Switch a day between named sections and one flat list                   |

All four view commands work both in a Markdown editor and while the agenda panel has focus, so you can switch views from the panel with the keyboard as well as with the mode buttons.

The agenda keeps a browser-style history of the views you opened (mode plus anchor date). Back and Forward replay it. They have no buttons in the header -- the two commands above are the way to reach them; their hotkeys apply while the agenda panel has focus and can be rebound like any other keybinding.

**Day view:**

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/agenda-day-dark.png">
    <img src="media/agenda-day-light.png" alt="Agenda day view">
</picture>

**Week view:**

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/agenda-week-dark.png">
    <img src="media/agenda-week-light.png" alt="Agenda week view">
</picture>

**Month view:**

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/agenda-month-dark.png">
    <img src="media/agenda-month-light.png" alt="Agenda month view">
</picture>

**Tasks view:** every open task at once, grouped by priority rather than by day. The three views above are anchored on a date; this one is not, so each row states its own date in full and only a date already behind today is coloured.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/agenda-tasks-dark.png">
    <img src="media/agenda-tasks-light.png" alt="Tasks view: open tasks grouped by priority">
</picture>

**The overdue backlog, split by age:** a day's slipped entries are four panels rather than one -- a missed repeat, what slipped within the week, what slipped earlier this year, and what is older than a year -- in that order. What a slipped entry asks of the reader differs with its age: a repeat missed on Tuesday is today's work, a date from May wants a new one, and a date from three years ago wants to be closed. A repeater is placed by that alone, ahead of the age of the date it missed.

**Answering a whole band at once:** the mark (`⋮`) at the end of an overdue panel's heading opens three actions that act on every entry of that band -- date them all today, take the planning date off all of them, or mark them all cancelled. A missed repeat is caught up to its next occurrence instead of being dated today, keeping its repeater. Each file is rewritten once; an entry whose heading has moved since the agenda was built is left alone and named in the extension's log, and the rest of the band still goes through. The notice that reports the move offers to undo it, and the undo skips any note that changed in the meantime.

**Several note directories as one agenda:** set [`markdown-org.workspaceDirs`](#markdown-orgworkspacedirs) to a list, and every directory in it is scanned into the same views. Each row then carries a small coloured dot at the head of its heading, and the dot's tooltip names the directory the task came from. A row of chips under the header names the same directories: a click hides one for as long as the panel stays open, another click brings it back. The chips narrow what is on screen by where it came from; the file tag below narrows it by which notes — see [Tag filtering](TAG_FILTERING.md).

**What the terse columns mean:** every element that reads as shorthand says the whole of it on hover. The time column names the start, the span where the entry has an end, and says "all day" where it draws nothing at all; the heading adds the file and the line it is written on, which is what tells two identical headings from two scanned directories apart; the offset column names the distance and its direction, until then carried by colour alone. The summary counts say what each number counts, and each glyph inside the git chip carries the clause it contributes rather than handing over all four at once. What already says the whole of what it means -- the day header, the section names, a day number in a calendar cell -- is left as it is.

**Git status of the source files:** the chip on the right of the header counts the files behind the current view by state -- unresolved conflicts (`!`), uncommitted changes (`●`), files touched by commits the remote does not have (`↑`), and files whose state could not be read at all (`?`, outside git or in a repository VS Code declined to open). Expanding it names those files, groups them by the same states, and offers the two actions for the view's own files -- committing them without touching unrelated edits in the same repository, and pushing the branch. Git commits the whole index, so a repository holding changes staged elsewhere is named in a question before the commit is made; a merge left unresolved takes the commit button away until it is settled in Source Control.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/agenda-git-dark.png">
    <img src="media/agenda-git-light.png" alt="Agenda git status chip, expanded to the source files behind the view">
</picture>

### Shadowed VS Code chords

The extension's `Ctrl+K …` chords deliberately take precedence over the VS Code defaults listed
below. The override applies where the `when` clause of each binding does -- in Markdown files, and
for the four view commands also in the agenda panel -- and, with the one exception noted under the
table, nowhere else: in any other editor the default command keeps working. Rebind either side in
**Keyboard Shortcuts** if you prefer the default.

| Chord                  | Extension command                | VS Code default it shadows             |
| ---------------------- | -------------------------------- | -------------------------------------- |
| `Ctrl+K Ctrl+T`        | Set TODO                         | Select Color Theme                     |
| `Ctrl+K Ctrl+D`        | Set DONE                         | Move Last Selection To Next Find Match |
| `Ctrl+K Ctrl+X`        | Set CANCELLED                    | Trim Trailing Whitespace               |
| `Ctrl+K Ctrl+P`        | Toggle Priority                  | Show All Editors By Appearance         |
| `Ctrl+K Ctrl+C Ctrl+…` | Insert CLOCK Start/Finish/Table  | Add Line Comment (`Ctrl+K Ctrl+C`)     |
| `Ctrl+K Ctrl+K Ctrl+…` | Timestamps, views, headings, tag | Select from Anchor to Cursor           |

One of these is easy to misread: `Copy Path of Active File` is `Ctrl+K P`, without the second
`Ctrl`, which is a different chord from `Ctrl+K Ctrl+P` and is not affected.

The CLOCK and `Ctrl+K Ctrl+K` entries differ from the rest: both are prefixes here, so in a
Markdown file the editor waits for the next chord instead of running the default command.

One binding under that prefix reaches past the editor: `Cycle Tag Filter` (`Ctrl+K Ctrl+K
Ctrl+T`) is bound in a Markdown editor and in the agenda panel, so the filter can be changed
while looking at the agenda itself, which is what it applies to. Outside those two the prefix is
left to the editor's own commands.

### Heading Management Commands

| Command                             | Hotkey                 | Description                                                                  |
| ----------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `Markdown Org: Move to Archive`     | `Ctrl+K Ctrl+K Ctrl+A` | Move current heading into the file's `*.archive.md`                          |
| `Markdown Org: Promote to Maintain` | `Ctrl+K Ctrl+K Ctrl+P` | Move heading to the maintain file (requires `markdown-org.maintainFilePath`) |

#### Migrating into a maintain file with **Promote to Maintain**

`Promote to Maintain` was built for a specific workflow: gradually migrating
tasks from an older planner into a single, current markdown file. Use cases
include moving entries out of a legacy org-mode `todo.org`, consolidating
several scratch `.md` files into one, or triaging an export from a tracker
that arrives as headings.

Set `markdown-org.maintainFilePath` to the target file (relative to the
workspace root). Place the cursor on any markdown heading and trigger the
command. The heading -- with its body and any child headings -- is cut
from the active document and appended to the maintain file under a
`# incoming` section. Behaviour in detail:

- The promoted heading is rewritten as a level-2 (`## `) heading
  regardless of its original level, so promoted blocks share a single
  inbox layout no matter where they came from.
- Child headings shift by `delta = 2 - <source level>` and are clamped
  to `[1, 6]`: an `### Subtask` under a `## ` source keeps `###`; an
  `## Subtask` under a `# ` source becomes `###`; an already-`######`
  child stays `######`.
- The first `# incoming` heading in the maintain file (case-insensitive
  match) is reused; the block is spliced in directly after it. If the
  file has no `# incoming`, the section is appended at the bottom; if
  the file does not exist yet, it is created.
- The maintain write is atomic (write to `*.tmp-<pid>-<ts>` + rename) and
  refuses to follow a symlink at the maintain path. The source document
  edit is applied through `vscode.WorkspaceEdit` -- the source remains
  open and unsaved until the user saves it, so the cut can be reviewed
  or undone.
- The command is disabled in untrusted workspaces and refuses paths
  outside the workspace, in line with the rest of the extension.

### Google Calendar Commands

| Command                                    | Hotkey | Description                                                                                                                               |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Markdown Org: Connect Google Calendar`    | -      | Authorize sync: pick a GNOME Online Accounts Google account (Linux) or run the BYO OAuth flow and store the refresh token in the keychain |
| `Markdown Org: Disconnect Google Calendar` | -      | Remove the stored token and client secret from the keychain                                                                               |
| `Markdown Org: Select Google Calendar`     | -      | Pick the calendar to sync into; pins `gcalSync.calendarId`                                                                                |
| `Markdown Org: Sync Now (Google Calendar)` | -      | Push tasks to Google Calendar once, on demand                                                                                             |

See [Google Calendar Sync](#google-calendar-sync) for the one-time setup.

## Settings

### `markdown-org.extractorPath`

**Type:** `string`
**Default:** `""` (use bundled binary)

Path to the markdown-org-extract executable.

- **Empty (default):** the extension uses the binary bundled inside the
  VSIX (`bin/markdown-org-extract[.exe]`). Falls back to looking up
  `markdown-org-extract` in `PATH` if the bundled file is missing
  (e.g. during local development without a prepared `bin/`).
- **Custom value:** overrides the bundled binary. Useful when
  contributing to markdown-org-extract or running with local patches.

```json
{
    "markdown-org.extractorPath": "/path/to/my/markdown-org-extract"
}
```

> **Security:** the configured path is executed by the extension every
> time agenda or related commands run. Only override the bundled
> binary with one you trust -- ideally installed via
> `cargo install markdown-org-extract` from
> [crates.io](https://crates.io/crates/markdown-org-extract), or built
> from a source tree you control. Do not point it at downloaded
> executables of unknown origin, files in world-writable locations
> (`/tmp`, shared caches), or scripts that wrap the extractor with
> extra side effects. The setting is machine-scoped, so it is read from
> your user or machine settings only -- a `.vscode/settings.json` inside
> an opened repository cannot choose the executable, trusted workspace
> or not. In untrusted workspaces VS Code additionally refuses to honour
> the setting (see `capabilities.untrustedWorkspaces` in `package.json`).

### `markdown-org.workspaceDir`

**Type:** `string`
**Default:** `""` (workspace root)

Directory to scan for markdown files. Empty value uses workspace root. Ignored while [`markdown-org.workspaceDirs`](#markdown-orgworkspacedirs) lists directories.

### `markdown-org.workspaceDirs`

**Type:** `string[]`
**Default:** `[]`

Directories to scan and show as one agenda. While the list is empty the single-directory setting above is used, so an existing configuration keeps working; a non-empty list replaces it rather than adding to it.

One person is one pool of work. The notes may sit anywhere -- a work repository, a home one, a project of its own -- but whoever does them plans in a single list, so the agenda gathers the tasks from everywhere and shows them together. Splitting them up is not for reading the lists apart; it is for narrowing the view for a while. Hence two levels: this setting says what is read at all, and the tags below select notes inside what was read. Both act over one agenda rather than switching between separate ones.

```json
{
    "markdown-org.workspaceDirs": ["/home/me/notes/work", "/home/me/notes/home"]
}
```

Each row of the agenda then carries a coloured dot at the head of its heading, and the dot's tooltip names the directory the task came from. Two directories with the same name are told apart by their parent (`work/notes` and `home/notes`). The colours are assigned in the order of the list and repeat after five directories, which is why the name is in the tooltip rather than in the colour alone.

Google Calendar sync reads the same list. An event's title is built from the path relative to the directory the task came from, so a note keeps its title whichever of the directories holds it.

[`markdown-org.fileTags`](#markdown-orgfiletags) is the second level: a tag matches a substring of the file's basename, not of its path, so it selects notes inside whatever the scan returned and cannot name a directory of its own.

### `markdown-org.maintainFilePath`

**Type:** `string`
**Default:** `""` (disabled)

Path to the maintain file for the "Promote to Maintain" command. Relative paths are resolved against the workspace root; the path must stay inside the workspace.

```json
{
    "markdown-org.maintainFilePath": "docs/maintain.md"
}
```

### `markdown-org.dateLocale`

**Type:** `string`
**Default:** `"en-US"`

Locale for date formatting in agenda views.

```json
{
    "markdown-org.dateLocale": "ru-RU"
}
```

### `markdown-org.uiLanguage`

**Type:** `"auto" | "en" | "ru"`
**Default:** `"auto"`

Language of the agenda interface: mode buttons, navigation, section and group titles, summary counts, and tooltips. Dates themselves follow [`markdown-org.dateLocale`](#markdown-orgdatelocale).

`"auto"` resolves the language from `markdown-org.dateLocale` first (only when you set that setting yourself), then from the VS Code display language, then falls back to English -- so setting the date locale to `ru-RU` also switches the interface to Russian, and a Russian VS Code gives a Russian agenda even with the date locale untouched. Set the value explicitly to keep the two apart (for example Russian dates with an English interface).

The setting covers the agenda panel: what it renders, and what an action started from it says afterwards. The group menu on an overdue band, its undo, and the git chip's Commit and Push raise their prompts, refusals, progress titles and status-bar confirmations in this language, and the numbers in them carry the digits of [`markdown-org.dateLocale`](#markdown-orgdatelocale), as the panel's own counts do.

Everything else stays in English regardless of the setting: notifications of the editor commands (archive, promote, CLOCK, clock table, calendar sync), diagnostics of the extractor and of the panel itself, the command names in the Command Palette, and the setting titles and descriptions on this page and in the Settings UI. Those come from the extension manifest or from code with no panel behind it (see [ADR-0019](docs/adr/0019-panel-action-notifications-follow-the-ui-language.md)).

```json
{
    "markdown-org.uiLanguage": "ru"
}
```

The setting is read on every agenda render, so an open panel follows a change on the next refresh. Command names are supplied by the extension manifest, which ships English strings only (see [ADR-0013](docs/adr/0013-agenda-ui-language-own-dictionary.md)).

### `markdown-org.highlightInEditor`

**Type:** `boolean`
**Default:** `true`

Colour org constructs in markdown editors: the planning keywords `SCHEDULED`, `DEADLINE`, `CLOSED`, `CREATED` and `CLOCK`, the parts of every timestamp (date, weekday, time, repeater, warning cookie), the status keywords `TODO` / `DONE` / `CANCELLED` on a heading, and the `[#A]` / `[#B]` / `[#C]` cookies.

The colours are the ones the agenda paints the same things with -- a DEADLINE and a `[#A]` red, a repeater and a `[#B]` amber, a SCHEDULED, a time and a `[#C]` blue, DONE green, a cancelled task grey -- so a task line reads the same in both places. They are theme colour tokens (`charts.*`, `disabledForeground`), so a light theme gets its own shades rather than fixed values.

This runs as editor decorations rather than a syntax grammar, which is what makes it work at **any** indentation. Markdown reads a line indented by four spaces or a tab as an indented code block and highlights nothing inside it, while `markdown-org-extract` reads the planning line at any indentation -- the editor and the agenda used to disagree about such a line.

The punctuation between the coloured parts -- the backticks, the colon after the keyword, the timestamp brackets, a CLOCK range's `--` and its `=> H:MM` duration -- keeps the colour the theme gives inline code (amber in Monokai), at any indentation. That is the colour it has always had at shallow indentation, where the backticks make markdown read the run as inline code; at four spaces or a tab markdown instead reads the line as an indented code block and gives it no colour, which made the same line look like two different things depending on how deep it sits. A one-rule injection grammar (`syntaxes/markdown-org-planning-line.tmLanguage.json`, contributed with `injectTo: ["text.html.markdown"]`) marks a planning line as inline code regardless of indentation, so the theme keeps deciding that colour.

The trade-off: the decorations cannot tell a planning line apart from the same text inside a real code block, so a documentation example is coloured too. Set the value to `false` to leave editors to the markdown grammar alone.

```json
{
    "markdown-org.highlightInEditor": false
}
```

### `markdown-org.firstDayOfWeek`

**Type:** `"monday" | "sunday" | "auto"`
**Default:** `"monday"`

First day of week in the month calendar. `"auto"` resolves the first day from the locale ([`markdown-org.dateLocale`](#markdown-orgdatelocale)) via `Intl.Locale.weekInfo`, falling back to `"monday"` when the API is unavailable.

The resolved weekday is also what the extractor is asked for: the month view requests the grid it draws, so the days from the neighbouring months at the edges of the calendar carry their tasks like any other cell, and their counts are the extractor's rather than a blank left by the page.

```json
{
    "markdown-org.firstDayOfWeek": "auto"
}
```

### `markdown-org.fileTags`

**Type:** `{ name: string; pattern?: string; include?: string[]; exclude?: string[] }[]`
**Default:** `[{ "name": "ALL", "pattern": "" }, { "name": "WORK", "pattern": "work" }, { "name": "PRIVATE", "pattern": "!work" }]`

Tags narrowing the agenda. A pattern is a case-sensitive substring matched against the file's **basename**, never against its path, so `"work"` does not pick up files inside a `networking/` directory -- and cannot name a directory either. Which directories are read is [`markdown-org.workspaceDirs`](#markdown-orgworkspacedirs); a tag selects notes inside whatever those returned.

- `""` (empty) -- filtering off; every note is shown. The tag's name has no special meaning.
- `"text"` -- basename contains `"text"`, anywhere in it: `"work"` takes `work-plan.md` and `homework.md` alike.
- `"!..."` -- the tag takes every note no other tag took. The text after `!` is only a marker, so `"!"`, `"!work"` and `"!xyz"` behave the same.
- `"include": ["a", "b"]` -- alternatives; a note matching either is in.
- `"exclude": ["c"]` -- keeps notes out, whatever `include` says about them. This is how `"everything about work except the archive"` is written: `{ "include": ["work"], "exclude": ["archive"] }`.

The same tags can travel with the notes instead of living in the settings: a directory declares them in `.markdown-org/tags.json`, holding exactly this list, and the file is synced through git like the notes around it -- which is what carries them to the other clients of the ecosystem.

Everything declared is merged into one dictionary: a tag means the same wherever a note came from, and a directory that never named a tag is filtered by it like any other. Where two declarations disagree, both are kept -- their including patterns become alternatives, and any exclusion holds. Run `Show File Tags` to see the merged dictionary with the directory that declared each pattern.

See [TAG_FILTERING.md](TAG_FILTERING.md) for examples. Cycle the active tag with `Cycle Tag Filter`.

### `markdown-org.currentTag`

**Type:** `string`
**Default:** `"ALL"`

Currently selected tag filter. Usually updated by `Cycle Tag Filter`. Stored at workspace scope when a workspace is open, otherwise globally.

### `markdown-org.agendaFontFamily`

**Type:** `string`
**Default:** `""` (system UI font stack)

Proportional font family of the agenda webview, given as a CSS font stack (e.g. `"Fira Sans", system-ui, sans-serif`). Empty uses `'Adwaita Sans', 'Noto Sans', system-ui, sans-serif`. Numeric columns (time, offsets) render in the same face with `tabular-nums`, so they still line up.

The value goes into a stylesheet, so it is checked first: only letters, digits, spaces, quotes, commas, dots, hyphens and underscores are accepted. Anything else — CSS functions such as `url(...)`, comments, braces, semicolons — is ignored and the default stack is used instead. Changing the setting re-renders an open agenda; no reopen needed.

All agenda colors are driven by VS Code theme tokens, so the panel follows the active light / dark / high-contrast theme.

### `markdown-org.agendaHeaderMode`

**Type:** `"auto" | "full" | "compact"`
**Default:** `"auto"`

Layout of the agenda header. The full header takes about a fifth of a short panel: a control row plus a hero line carrying a large weekday or month title. The compact layout puts that title on the control row and tightens the type and spacing; every control stays where it was, nothing is hidden.

`auto` picks compact once the full header would take a fifth of the panel -- the case where it crowds out the tasks it introduces -- and returns to full once it would take under 0.15 of it, following the panel as it is resized. The two thresholds differ so that dragging the editor split across the boundary does not flip the layout back and forth. Until the header has been measured (the very first paint) `auto` falls back to a panel height of 520 px. `full` and `compact` pin the layout regardless of size.

The chip in the agenda control row cycles the three values (`auto` -> `full` -> `compact`) and names the current one; `Markdown Org: Cycle Agenda Header Layout` does the same from the Command Palette. Changing the setting by any route reflows an open agenda; no reopen needed.

### `markdown-org.agendaGrouping`

**Type:** `"sections" | "flat"`
**Default:** `"sections"`

How a day is grouped in the Day and Week views. `sections` splits it under named headings: what is set for an hour of that day, what has no hour of its own, and the overdue bands (a missed repeat, this week's slippage, earlier this year, longer ago). Each heading carries the count of the rows under it, and the overdue ones carry the group menu.

`flat` drops the headings, and with them the counts, the group menus and the folding described below, leaving one list per day. The rows and the order they are read in are the same either way — what is set for an hour, then what has no hour, then the overdue at the bottom — so switching does not move a row past another. What the headings said is still legible in a row's own colour and in the date it carries.

The Month view is unaffected: it draws counts and no rows. Changing the setting re-renders an open agenda; no reopen needed.

`Markdown Org: Toggle Agenda Day Sections` switches between the two values from the Command Palette. The setting answers a panel too short for its headings, and that is noticed while reading rather than in the settings editor.

### `markdown-org.clockRoundMinutes`

**Type:** `number`
**Default:** `0` (no rounding)
**Range:** `0`--`60`

Round CLOCK timestamps to the specified number of minutes (e.g. `15`, `30`). Start time rounds down, finish time rounds up to keep duration non-zero.

`0` disables rounding. Negative and out-of-range values are also treated as "no rounding".

### `markdown-org.weekdayLocale`

**Type:** `"ru" | "en"`
**Default:** `"ru"`

Language for the weekday short name inserted into timestamps (`CREATED`, `SCHEDULED`, `DEADLINE`, `CLOCK`). `"ru"` produces `Пн`/`Вт`/...; `"en"` produces `Mon`/`Tue`/....

```json
{
    "markdown-org.weekdayLocale": "en"
}
```

### `markdown-org.gcalSync.clientId`

**Type:** `string`
**Default:** `""` (sync disabled)
**Scope:** `machine` (set in user settings only -- not per-workspace, and excluded from Settings Sync, since it is a per-machine credential)

Google OAuth Desktop `client_id` for Google Calendar sync (bring your
own). The matching `client_secret` is entered once when you run
`Connect Google Calendar` and is stored in the OS keychain via
`SecretStorage`, never in this setting or in the VSIX. See
[Google Calendar Sync](#google-calendar-sync) for the full setup.

```json
{
    "markdown-org.gcalSync.clientId": "1234567890-abc.apps.googleusercontent.com"
}
```

## Workspace Trust

The extension is **limited in untrusted workspaces**. The following commands are disabled because they read configured executable/file paths: `Show Agenda*`, `Show Tasks`, `Cycle Tag Filter`, `Insert CLOCK Table`, `Move to Archive`, `Promote to Maintain`.

## Google Calendar Sync

Optional, opt-in one-way sync designed to push tasks carrying an active
`SCHEDULED` / `DEADLINE` timestamp to Google Calendar. It is off until you
connect. On **Linux** you can authorize via a Google account already set up
in **GNOME Online Accounts** (no OAuth client to create); on every platform
you can bring your own OAuth Desktop client. See
[ADR-0010](docs/adr/0010-google-calendar-sync.md) and
[ADR-0011](docs/adr/0011-google-calendar-sync-goa-provider.md) for the design.

**Sync Now** pushes the dated tasks, shows a status-bar spinner while it
runs, and reports what changed; **Show details** opens the full per-event
log:

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-gcal-sync-dark.gif">
    <img src="media/demo-gcal-sync-light.gif" alt="Sync Now: spinner, summary, and the per-event details channel">
</picture>

Three commands cover the whole flow: connect once, choose a calendar, then
sync on demand (or on save).

### One-time setup (bring your own OAuth client)

The extension ships **no** Google credentials; you create a Desktop
OAuth client in your own Google Cloud project. The client secret is
stored only in your OS keychain, never in the extension.

1. In the [Google Cloud Console](https://console.cloud.google.com/),
   create (or pick) a project.
2. Enable the **Google Calendar API** for that project.
3. Create an **OAuth client ID** of type **Desktop app**.
4. Put the generated `client_id` in the
   [`markdown-org.gcalSync.clientId`](#markdown-orggcalsyncclientid)
   setting.
5. Run **Markdown Org: Connect Google Calendar** from the Command
   Palette. You are prompted for the `client_secret` once; it is stored
   in the OS keychain via `SecretStorage`. A browser opens for Google's
   consent screen; the extension listens on a loopback redirect
   (`127.0.0.1`) with PKCE to receive the authorization code.

After connecting, the refresh token lives in `SecretStorage` (the OS
keychain on all three platforms). **Markdown Org: Disconnect Google
Calendar** removes the stored token and client secret.

> **Linux:** `SecretStorage` requires an active keyring service
> (gnome-keyring or a compatible Secret Service implementation). Without
> one, VS Code cannot persist the token and connecting will fail.

Connect prompts for the `client_secret`, then completes the browser
authorization and stores the token:

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-gcal-connect-dark.gif">
    <img src="media/demo-gcal-connect-light.gif" alt="Connect Google Calendar: client-secret prompt, connecting, connected">
</picture>

### Linux: GNOME Online Accounts (no OAuth client)

On Linux you can skip the Google Cloud setup entirely and reuse a Google
account already configured in **GNOME Online Accounts** (GNOME Settings →
Online Accounts, with **Calendar** enabled). GNOME holds the OAuth
credentials and refreshes the token, so there is no `client_id` /
`client_secret` to manage and no test-client token expiry.

The source of the token is controlled by `markdown-org.gcalSync.authProvider`:

- `auto` (default) -- on Linux, use GNOME Online Accounts when a Google
  account is present there; otherwise fall back to the BYO OAuth flow above.
- `goa` -- always use GNOME Online Accounts (Linux only).
- `oauth` -- always use the BYO OAuth flow.

With a single GNOME Google account it is picked automatically. With several,
**Markdown Org: Connect Google Calendar** shows a picker and stores the
chosen email in `markdown-org.gcalSync.goaAccount`. Nothing is written to the
keychain in this mode -- GNOME owns the credentials. This path needs a session
DBus bus reachable from VS Code; where it is not (some remote / Flatpak
setups), `auto` falls back to the OAuth flow.

### Choosing the calendar

Run **Markdown Org: Select Google Calendar** to pick which calendar
receives the events; it pins the choice in
`markdown-org.gcalSync.calendarId`. With no pinned id, the sync finds
(or creates) a calendar named after `markdown-org.gcalSync.calendarName`.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/demo-gcal-select-dark.gif">
    <img src="media/demo-gcal-select-light.gif" alt="Select Google Calendar: pick from your writable calendars">
</picture>

### Running a sync

Two ways to trigger a sync:

- **Markdown Org: Sync Now (Google Calendar)** pushes once, on demand.
- The **sync-on-save** trigger (`markdown-org.gcalSync.syncOnSave`) runs a
  sync after you save a markdown file. It is **off by default**; when
  enabled, runs are debounced by
  `markdown-org.gcalSync.syncOnSaveDebounceMs` (5000 ms by default) so a
  burst of saves coalesces into one sync.

The two triggers differ in how they surface the result so that on-save
runs stay out of the way:

- **Sync Now** -- always shows the summary toast (you asked for it).
- **Sync on save** -- silent on success and "no changes"; a toast appears
  only when something failed (`failed > 0`), so a broken token or a
  network error is still visible. The status-bar spinner runs during
  every sync, and the **Calendar Sync** output channel keeps the full
  per-event log for both triggers.

Each sync extracts the tasks that carry an active `SCHEDULED` /
`DEADLINE` timestamp and pushes the corresponding events: a task with no
end time gets a timed event of `markdown-org.gcalSync.defaultEventMinutes`
duration (60 minutes by default). When a task becomes DONE, the
`markdown-org.gcalSync.onDone` setting decides whether to `delete` its
event or `keep` it. A CANCELLED task (either spelling) is always excluded
from the push and its event is deleted unconditionally, independent of
`onDone`.

### One sync at a time

Only one sync runs at a time:

- **Within one VS Code window**, requests that arrive while a sync is
  running are serialised per `markdown-org.gcalSync.concurrencyPolicy`:
  `queue` coalesces them into a single rerun, `cancel` aborts the
  in-flight run and restarts.
- **Across windows / processes**, a file lock in the workspace prevents a
  second sync from starting while another already holds it.

### Property write-back is deferred, never forced

To address an event by a stable key, the sync writes an `ID` (and the
returned `GCAL_EVENT_ID`) into the task's `org-properties` block. This
write-back is conflict-safe: if the target file currently has **unsaved
edits**, or has **shifted on disk since the tasks were extracted**, the
write is **deferred** rather than forced over your changes. Deferred
files are counted as `deferred` in the sync summary and retried on the
next sync. A task whose `ID` was freshly minted is **not published**
until that id is successfully written back, so a deferred write never
produces a duplicate event -- the same task reuses the same id on the
next run.

### Current limitations (MVP)

- **Push only.** Changes flow from your `.md` files to Google Calendar.
  Reverse sync (calendar -> markdown) is planned for a later phase.
- **No orphan cleanup.** Events left behind by tasks that were deleted
  outright (heading removed, not marked DONE) are not purged
  automatically.
- **Not every repeater becomes a recurring event.** Most do: `+Nd` / `+Nw` /
  `+Nm` / `+Ny` / `+Nh` map to `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY|HOURLY` with
  `INTERVAL=N`, and `+1wd` to `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` (needs the
  bundled extractor 0.10.0 or newer, which is where `timestamp_repeater` comes
  from). What has no single-rule form stays a one-shot event on its base date:
  `+Nwd` with `N > 1` ("every N-th workday"). The `+` / `++` / `.+` prefixes
  differ only in how org shifts the date on completion, which a calendar grid
  has no notion of, so they do not change the rule.
- **A moved occurrence stays a separate event.** An occurrence a repeating
  entry does not have leaves with the rule as an `EXDATE` line -- both the days
  the entry cancels itself (`EXDATE:` in its `org-properties`) and the days
  another entry stands in for (that entry's `SERIES_ID` naming this one's `ID`,
  and its `RECURRENCE_ID` naming the occurrence). It needs the bundled
  extractor 0.18.0 or newer, which is where those keys come from, and 0.19.0
  or newer for the forms a calendar export writes them in -- an `EXDATE`
  carrying a time, a `RECURRENCE_ID` written with seconds. The entry
  standing in has a heading, a file and a line of its own, so it is pushed as
  its own event rather than patched into the series through the calendar's
  `instances` collection -- which is what the agenda shows as well.
- **Second-window edits are invisible.** If the same file is open in a
  second VS Code window with unsaved edits, this extension cannot see
  that other window's in-memory state. A sync writing back to disk there
  may trigger VS Code's standard "file changed on disk" prompt in the
  other window.

### Settings

All Google Calendar sync settings live under the
`markdown-org.gcalSync.*` namespace:

| Setting                                      | Type                  | Default          | Description                                                                                                                                                     |
| -------------------------------------------- | --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdown-org.gcalSync.clientId`             | `string`              | `""`             | Google OAuth Desktop `client_id` (BYO). The `client_secret` is entered on connect and kept in the OS keychain, not here. Scope `machine`.                       |
| `markdown-org.gcalSync.calendarName`         | `string`              | `"markdown-org"` | Name used to find-or-create the sync calendar when no `calendarId` is pinned.                                                                                   |
| `markdown-org.gcalSync.calendarId`           | `string`              | `""`             | Pinned Google calendar id (takes precedence over `calendarName`). Usually set by **Select Google Calendar**.                                                    |
| `markdown-org.gcalSync.concurrencyPolicy`    | `"queue" \| "cancel"` | `"queue"`        | Behaviour when a sync is requested while one is running (within a window): `queue` coalesces into a single rerun; `cancel` aborts the current run and restarts. |
| `markdown-org.gcalSync.syncOnSave`           | `boolean`             | `false`          | Run a (debounced) sync after saving a markdown file.                                                                                                            |
| `markdown-org.gcalSync.syncOnSaveDebounceMs` | `number`              | `5000`           | Debounce interval (ms) for the sync-on-save trigger.                                                                                                            |
| `markdown-org.gcalSync.onDone`               | `"delete" \| "keep"`  | `"delete"`       | When a task becomes DONE: `delete` removes its calendar event; `keep` leaves it.                                                                                |
| `markdown-org.gcalSync.defaultEventMinutes`  | `number`              | `60`             | Duration for a timed task event when no end time is given.                                                                                                      |

## Dependencies

The extension delegates markdown parsing to
[`markdown-org-extract`](https://crates.io/crates/markdown-org-extract) --
a Rust utility that scans `.md` files for headings, timestamps, and
CLOCK entries. The compiled binary for your platform is shipped inside
the VSIX, so there is nothing to install separately.

If you want to use a custom build (e.g. you are contributing to
markdown-org-extract or running with local patches), point
[`markdown-org.extractorPath`](#markdown-orgextractorpath) at your
binary. The setting is also useful in untrusted workspaces where the
bundled binary is disabled until you trust the workspace.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for build, test, debug, project
layout and release process.

## Release notes

Per-version changes are tracked in [`CHANGELOG.md`](CHANGELOG.md) using
the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## License

Released under the [MIT License](LICENSE) -- see the LICENSE file for the
full text. The `license` field in `package.json` carries the SPDX
identifier `MIT`.

The package also bundles the prebuilt `markdown-org-extract` binary, which
is a separate MIT-licensed work and is statically linked. Both notices ship
inside the VSIX next to the binary:

| №   | Path                                                | Covers                                      |
| --- | --------------------------------------------------- | ------------------------------------------- |
| 1   | `bin/LICENSE.markdown-org-extract`                  | the extractor's own code                    |
| 2   | `bin/THIRD-PARTY-LICENSES.markdown-org-extract.txt` | the crates linked into the extractor binary |

Both files are unpacked from the extractor's release archive at package
time rather than kept in this repository, so they always describe the
version actually shipped.
