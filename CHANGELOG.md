# Change Log

All notable changes to the "Markdown Org" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The git chip reads the repository again before it answers. VS Code watches
  the files of its workspace folders, and the Git extension builds its state
  from what those watchers report — a notes repository outside every workspace
  folder sends no such report, so the chip kept saying "clean" over a note that
  had just been written until Refresh was pressed in Source Control by hand. A
  repository the workspace does hold is left alone: there the watchers fire,
  and a status pass per render would be work nobody asked for.

- Holding Shift+Up or Shift+Down walks the date along instead of losing a
  repeat. The command was sent again before the previous edit had landed, and
  the second one read a document that was about to change: its edit was refused
  and reported as "the value was not written", which is what a held key
  produced every time. The adjust commands now run one after another.

### Added

- The last of the agenda's terse columns say what they mean on hover. The time
  column names the start, the span when the entry has an end, and says "all
  day" where it draws nothing — an empty cell was the one statement the page
  never made in words. The heading adds the file and the line it is written on,
  which is what tells two identical headings from two scanned directories
  apart. The offset column names the distance and its direction, until now
  carried by colour alone, and says which way a Tasks row points where there is
  no anchor day to measure from. The summary counts say what each number counts:
  "3 overdue" never said overdue out of what. Every glyph inside the git chip
  carries the clause it contributes to the chip's own tooltip, so a reader
  asking about one counter is not handed all four. The mark at the head of a
  file row says what the glyph stands for, next to the tooltip that names the
  path.

- The day header, the hero title and its TODAY badge, the section names and the
  day number inside a calendar cell stay as they are: each is plain text that
  says the whole of what it means, and the element around it already answers
  for the rest.

- An occurrence a repeating entry does not have is withheld from the series
  sent to Google Calendar. The core reports a cancelled or moved occurrence
  through the `org-properties` keys of the series and of the entry replacing it
  (`EXDATE`, `SERIES_ID`, `RECURRENCE_ID`, core 0.18.0); until now the export
  read none of them, so a replacement went over as an event of its own while
  the series kept expanding its rule over the day it was moved away from, and
  the reader saw that day twice. The series now carries an `EXDATE` line beside
  its `RRULE` for every occurrence it does not have -- the days it cancels
  itself and the days another entry stands in for -- which are the same days
  the agenda already leaves empty. The calendar treats the two alike: the day
  loses the occurrence either way, and which of the two entries owes the
  arrears is a question the agenda answers, not the calendar.

### Fixed

- A property written to a note is no longer shadowed by an older copy of the
  same key. The `org-properties` block was found only directly under the
  planning lines and only inside exactly three backticks, so a note whose block
  sits further down the body, or is fenced with tildes or a longer run, read as
  a note with no block at all: a second block went in above the first, and the
  extractor — which reads every block of the entry and keeps the last one —
  handed back the stale value. The phone writes the same way this side now
  reads: every block of the entry counts, whatever fences it, and a write lands
  in the last one. With the exception keys of a repeating series this had
  become a way to lose an `EXDATE`, putting a cancelled occurrence back on the
  agenda.
## [0.18.0] - 2026-08-18

### Added

- A **Sync** action in the agenda's git dropdown: one press fetches, moves the
  branch onto its upstream when it is only behind, and pushes what is only
  ahead. It is the control the phone has had since it shipped, and the two
  clients share the repositories — an exchange one of them makes the reader
  assemble by hand in Source Control is one that gets assembled wrongly, or
  not at all. The fast-forward is the order rather than a flag: `pull` runs
  only where the branch has nothing of its own, so there is nothing for a
  merge to be made out of. A branch that is both behind and ahead is left
  exactly as it stands and reported by name, because merging is a decision
  with an author. Unlike the other two, the button is offered wherever there
  is a repository at all: what it answers for is the other side, which none of
  the counters here can see.

- The month calendar rings the chip of a date a deadline is coming due on,
  and names it in the tooltip. Org warns about a deadline in today's agenda
  for the last `org-deadline-warning-days` (or the `-Xd` the timestamp
  carries); the grid already shows the reader where that date is, so the mark
  goes on the date itself. A ring rather than a second fill: the fill is what
  a date in arrears takes, and once a date has gone by what it owes is the
  state worth naming. The window is the extractor's to decide — the mark
  follows the copy it files under today, and the offset on that copy names
  which occurrence is meant. Of a deadline that repeats, the ring goes on that
  occurrence alone: every occurrence is the same line of the same file, so
  matched by the task alone the ring ran to the end of the grid, and a weekly
  deadline marked the rest of the month.

### Fixed

- A month cell counts what is dated to that day and nothing else. The core
  files a task under its own date and repeats it under today — as arrears, or
  as a deadline coming up — so the chip counted the same task twice, once in
  its own cell and once in today's, and today's number was the whole
  collection's backlog rather than the day's work. The red tint now comes from
  the cell's own date: it has gone by with planning still on it. A plain
  timestamp that has been and gone leaves no debt behind, as the core has it,
  so a meeting last Tuesday no longer colours the cell. The tooltip's
  breakdown by age is read off each date's own rows too, so the bands now
  describe the date under the pointer instead of the collection.
- The chip's tooltip says "overdue" rather than a count of it. The count it
  used to state was the doubled one, and the number the reader wants is
  already on the chip.
- The days from the neighbouring months at the edges of the month calendar
  carry their tasks. The panel asked the core for the month and then padded
  the grid out to whole weeks itself, so those cells stood for dates the
  payload said nothing about: a task on 30 November was missing from
  December's first cell, and clicking it opened a day the count had denied.
  The core now answers with the grid itself (`--agenda month-grid`, core
  0.17.0), whole weeks and all, and the page lays out the days it was sent.
  The week those weeks begin on is `markdown-org.firstDayOfWeek`, resolved
  before the call -- `auto` is answered from the date locale, where the core
  reads none -- so the column headings cannot disagree with the dates under
  them.

- The repeat tooltip on a dated row names the occurrence after that row's own
  day. It read the next occurrence from today, which is the same date on every
  row of the week: a daily task shown on Monday, Tuesday and Wednesday said
  "next Tuesday" three times over. The core now resolves the occurrence after
  each rendered day (`timestamp_next_after`, core 0.17.0) and fills it where
  the row has a day of its own; the copies borrowed into today -- arrears, and
  deadlines coming due -- keep answering from today, which is what they are
  there to say.

### Changed

- The bundled `markdown-org-extract` is 0.17.0. A binary named by
  `markdown-org.extractorPath` must be at least that: the month view asks for
  a grid earlier ones do not offer, and the warning about an older binary now
  says so.

## [0.17.0] - 2026-08-16

### Added

- `Ctrl+F` searches the agenda panel: the editor's own find widget now opens
  over it, with the usual highlighting and `Enter` / `Shift+Enter` between the
  matches. A week holds enough rows that finding one by eye is the slow part.
  The page takes the keyboard focus when it is shown, so the shortcut works on
  the panel that has just opened rather than after a click into it. `F3` and
  `Shift+F3` repeat the search the way they do in an editor, from anywhere in
  the panel: VS Code binds the webview find actions to `Enter` alone, under a
  condition that holds only while the widget itself is focused, so they are
  reached through `Find Next in Agenda` / `Find Previous in Agenda` instead.
  A widget that was dismissed is reopened by the same key rather than leaving
  it dead. The search reads what is rendered, so a row inside a folded band is
  out of its reach until the band is unfolded.
- `Markdown Org: Insert Timestamp (no keyword)` (`Ctrl+K Ctrl+K Ctrl+I`) writes
  a plain timestamp -- `` `<2026-08-16 Sun>` `` -- under the heading, and
  removes it when repeated, like the two planning commands beside it. This is
  the appointment as opposed to the date somebody owes: a class every Monday is
  `` `<2025-09-01 Mon 19:00 +1w>` ``, while a monthly bill is `SCHEDULED:` with
  `++1m`. Until now the line had to be typed by hand.
- `Markdown Org: Set Priority` (`Ctrl+K Ctrl+Shift+P`) picks the value: the
  first letters as a shortlist, a field for anything else in the range
  org-mode reads (`A`..`Z`, `0`..`64`), and an entry that clears the cookie.
  The toggle beside it still writes `[#A]` and takes it back; a numeric
  priority, which the agenda has always sorted by, previously had to be typed
  as `[#12]` by hand.

### Fixed

- Bundled extractor bumped to 0.16.0
  (`package.json` `x-markdown-org.extractorVersion`), which stops reporting a
  keyword-less date that has passed as overdue: only `SCHEDULED:` and
  `DEADLINE:` carry a missed date into today, as upstream Org-mode does. A
  weekly class written as `` `<2025-09-01 Mon 19:00 +1w>` `` is on the agenda
  on Mondays instead of standing as a year of arrears in between.
- A keyword-less timestamp line counts as part of the planning block. The walk
  over that block stopped at the first line it did not recognise, so on a
  heading whose first line was such a timestamp, `Insert SCHEDULED Timestamp`
  put its line above it, and `Toggle Timestamp Active/Inactive` refused to flip
  a form that is legal there (ADR-0005: without a keyword, both are).

### Changed

- Week view: the line that runs down the left of a day is drawn heavier -- 60%
  of the link colour instead of a third of it, and 3px instead of 2px. It marks
  where one day ends and the next begins, which is how the week is read at a
  glance, and at the old weight it was easy to miss on a light theme.
- The band of tasks set for an hour is called "At a set time" -- «Ко времени» --
  instead of "Scheduled today". The old name held for one day in seven: the
  week draws the band under every day of it, and the day view draws it for
  whichever day was stepped to. The new one names the hour rather than the day,
  so it holds wherever the band is drawn, and it reads as a pair with "All-day
  & upcoming" beside it.
- Week view: the band announces itself there as well. It was left without a
  heading because its title named today; with a title that holds for any day,
  the reason is gone, and a band that has a heading can be folded away from it
  like every other. The sibling client on Android draws and names it the same
  way.

## [0.16.0] - 2026-08-15

### Added

- Agenda sections fold away: a press on a section head -- "All-day & upcoming",
  an overdue band, a priority group -- hides its rows and leaves the heading
  with its count, and a second press brings them back. Works in the Day, Week
  and Tasks views; a band folded in the week is folded on every day of it. What
  is folded lasts as long as the panel is open, and a day rendered without
  headings (`markdown-org.agendaGrouping: "flat"`) folds nothing, since there
  would be nothing to unfold it by.
- Week view: the overdue bands carry the group menu the day view gives them, so
  the same band offers the same action in both views. The menu acts on the day
  it stands under, not on the first day of the week.
- `Markdown Org: Toggle Agenda Day Sections` switches
  `markdown-org.agendaGrouping` between the named sections and the flat day,
  which until now was only reachable through the settings editor -- the setting
  answers a narrow panel, and that is decided while reading, not in settings.
- Week view: a line down the left of each day, from its heading to its last
  row, so a band such as "All-day & upcoming" reads as part of the day above it
  rather than as a block of its own.
- Git panel: the "Not pushed" group lists the commits Push would send -- short
  hash and subject -- above the files they touched, with the rest summarised as
  "and N more". The group now appears whenever there is something to push, even
  when its only file is also uncommitted and listed above.
- Git panel: commit and push run under a progress notification, and both
  buttons go inert until the action is over, so a second click cannot start on
  top of the first. A status that arrives mid-action -- staging alone produces
  one -- no longer hands them back early. The press closes the dropdown, so
  which of the two is running is said by the notification; reopening the chip
  meanwhile shows it on the button as well.
- Git panel: a commit is refused a second time before it happens when the
  repository holds staged changes this view does not name. Git commits the
  whole index and cannot be told otherwise, so the panel names the repository
  and the number of extra files and asks; dismissing the question commits
  nothing.
- Git panel: unresolved merge conflicts get their own group and chip counter
  ("! N"), and the commit button steps aside while they stand. Committing from
  the panel is refused before the message is asked for, naming the repository
  and pointing at Source Control, where they are resolved.

### Changed

- Git panel: push reports the number of commits it sent rather than the number
  of repositories, and a refusal from the remote is explained -- which branch
  is behind which upstream, and that the missing commits have to be fetched --
  instead of being repeated as git's own message. Nothing in this flow forces a
  push.

### Fixed

- Git chip: a source file whose repository could not be read is counted as
  unknown ("? N") instead of being folded into "clean". The diagnostic log
  names the cause when git reports a repository that VS Code declined to open.
- Git panel: a view spanning several repositories no longer stops at the first
  one with nothing to commit -- git refuses an empty commit, and that refusal
  used to end the round before the repositories after it were reached. Only
  files git reports as changed are staged.
- Git panel: a source file reached through a symlink that is itself committed
  and points out of its repository is staged under the tracked path again,
  rather than under the target git does not know.
- Git panel: failures and refusals git reports -- a failed commit, a failed
  push, a push from a detached HEAD -- are worded in the interface language
  instead of arriving half in English.
- CLOCK lines: an entry whose end was stepped back past its start writes its
  duration as `-2:30` rather than `-3:-30`.
- Git panel: a push that creates an upstream branch says so, naming the
  repository and branch it created; it used to finish in silence, because the
  count it reported is not defined for a branch that had no upstream. The
  question that asks for that push names the repository too -- a view can span
  several, and the branch is called the same in all of them.
- Git panel: a repository git could not be asked about -- an ownership refusal,
  a git that failed to start -- is asked about again on the next pass instead
  of being remembered as "outside git" until the window is reloaded.
- Agenda actions: the counts in what a commit, a push or a group action reports
  are printed in the digits of `markdown-org.dateLocale`, like the counts on the
  buttons that raise them -- pressing "Commit ٣" was answered with "Committed 3
  files", one action in two numbering systems.
- Notifications the extension raises start with a capital letter, so a message
  reads as a sentence after the "Markdown Org: " prefix rather than as a
  fragment.
- Google Calendar: a rate-limited or timed-out token refresh (HTTP 429, 408) is
  waited out and retried, as the calendar requests themselves already were.
  Treated as a rejected grant, it ended the whole synchronisation.

## [0.15.0] - 2026-08-13

This release is largely about what the agenda looks like, and the theme running
through it is that a heap is not a plan. A day used to arrive as one run of
rows; it is now stacked in named, counted sections -- what is set for an hour,
then what is not, then the overdue backlog split by how long ago it slipped --
and the week view stacks each of its days the same way instead of pouring
everything overdue into one heap at the top. A section that is named can be
acted on: the mark at the end of a heading answers the whole band in one edit
that can be put back. The month grid, which has only counts to work with, says
in a tooltip what its red number is made of.

The same reading holds when there is more to read: several note directories
merge into one timeline, a coloured dot at the head of a row says where the row
came from, and a chip per directory takes it off the screen and back without
walking the notes again.

Density is a setting rather than a verdict. Sections cost height, and height is
what a small panel has least of, so `markdown-org.agendaGrouping` turns the
headings off and gives their rows the space back -- the same rows in the same
order, which is the part worth keeping.

### Added

- `markdown-org.agendaGrouping` decides whether a day is split into named
  sections or drawn as one list. `sections`, the default, is what the Day and
  Week views have been doing; `flat` drops the headings, their counts and the
  group menus that ride on them, and gives the rows the height those headings
  took. The order is untouched — what is set for an hour, then what has no hour
  of its own, then the overdue at the bottom — so a row never moves past
  another when the setting changes. The Month view is unaffected: it draws
  counts and no rows.
- Several note directories can be read as one agenda:
  `markdown-org.workspaceDirs` takes a list, and every directory in it is
  scanned. The setting that came first, `markdown-org.workspaceDir`, keeps
  working and is used while the list is empty, so an existing configuration is
  unchanged. Google Calendar sync follows the same list.
- A row of a multi-directory agenda carries a small coloured dot at the head of
  its heading, and the dot's tooltip names the directory the task came from. A
  mark rather than a grouping: the agenda is one timeline over every directory,
  and grouping rows by where they live would break the axis the layout is built
  on. Directories that share a name (two different `notes`) are told apart by
  their parent in the tooltip. With one directory scanned there are no dots and
  the agenda is exactly as it was.
- A multi-directory agenda gets a row of chips under the header, one per
  scanned directory, and a click takes that directory off the screen and back.
  The chip works on the rows already in hand, so turning a directory back on
  costs nothing and the notes are not walked again; the state lives in the
  panel and is gone when it closes, which is what "for a moment" means. This is
  the narrower of the two filters and applies first: the chips say which
  directories are on screen, the file tag says which of their notes.

- Tags can travel with the notes instead of living in the settings: a notes
  directory declares them in `.markdown-org/tags.json`, holding what
  `markdown-org.fileTags` holds, and the file is synced through git like the
  notes around it -- which is how the other clients of the ecosystem come to
  know the same tags. Everything declared merges into one dictionary: a tag
  means the same wherever a note came from, so a directory that never named a
  tag is filtered by it like any other, and reordering the directories changes
  nothing. Where two declarations disagree they are both kept, their including
  patterns becoming alternatives.
- A tag can refuse part of what it takes: `include` and `exclude` beside the
  single `pattern` the setting has always had. `{"include": ["work"],
"exclude": ["archive"]}` is "everything about work except the archive", which
  one substring cannot say. Refusing wins over taking, including across
  directories -- otherwise a directory that never heard of an exclusion would
  undo it. A note refused by every tag that would otherwise take it falls to the
  tag holding the rest (`!`) rather than out of the agenda.
- `Show File Tags` writes out the merged dictionary: every tag, every pattern
  under it, what that pattern does, and which directory -- or the settings --
  declared it. The answer to why a tag shows what it shows, which the name in
  the dropdown cannot give once several directories have been merged behind it.

- Each overdue panel can be answered as a whole: the mark at the end of its
  heading opens a menu that dates every entry of the band today, takes the
  planning date off every one of them, or marks them all cancelled. A missed
  repeat is caught up to its next occurrence rather than dated today, which is
  the rule marking a repeating task DONE already follows. Every file is
  rewritten once, entries whose heading has moved since the agenda was built are
  left alone and named in the log, and the notice that reports the move offers to
  put it back -- an undo that skips any note changed in the meantime.

### Changed

- **The week view groups each day the way the day view does.** A day used to
  read as four buckets run together, with everything overdue in one heap at the
  top; it now carries the same sections the Day view stacks -- what is set for
  an hour, then what has no hour of its own, then the overdue backlog split
  into its four bands (missed repeats, this week's slippage, earlier this year,
  long ago), each with its name and its count. All but the first: "Scheduled
  today" names today, which holds for one of the seven days on screen, and the
  day header above the rows has already said which day they belong to. The
  order matches the Day view: today's work first, the backlog underneath. What
  is overdue is still decided against the day being lived through. Group actions
  stay in the Day view -- a band there is a day's band, and one in a week is
  seven of them.
- **The band of untimed work says what it holds, in Russian.** The heading read
  «Без времени и предстоящие», which a reader parses as one negation carried
  over both halves -- neither timed nor upcoming -- while the band holds the
  opposite: today's tasks with no hour of their own, and what is coming within
  the window ahead. It now reads «Весь день и предстоящие», the wording a
  calendar uses for an entry that belongs to a day rather than to an hour. The
  English heading, `All-day & upcoming`, already said this and is unchanged.
- **The month grid says what a day's overdue count is made of.** The red chip
  in a cell counted the missed entries and no more, so six repeats missed this
  week and six dates left in 2021 read alike. Its tooltip now names the bands
  behind the number ("8 tasks, 6 overdue (Missed repeats: 2, Overdue earlier:
  4)"). The grid itself is unchanged -- a cell has room for a number, not for
  four rows -- and the split is the one the other two views draw, so they
  cannot disagree about which band an entry is in.
- **The four view commands share one chord scheme, and four bindings moved.**
  Day and Tasks sat on `Ctrl+K Ctrl+K Ctrl+<letter>` while Week and Month were
  two steps (`Ctrl+K Ctrl+W`, `Ctrl+K Ctrl+M`), so knowing one of them said
  nothing about the others -- and the two short chords shadowed VS Code's
  `Close All Editors` and `Toggle Maximize Editor Group` in every Markdown file
  and in the agenda. All four views are now `Ctrl+K Ctrl+K Ctrl+<letter>`: Day
  `Y`, Week `W`, Month `M`, Tasks `L`. The letter `M` was held by the two
  heading-move commands, the only four-step chords in the extension, and they
  move up to the same three-step scheme: Move to Archive is `Ctrl+K Ctrl+K
Ctrl+A` and Promote to Maintain is `Ctrl+K Ctrl+K Ctrl+P`. On macOS every one
  of them uses `Cmd` as before. If you had learnt the old chords, rebind them
  in **Keyboard Shortcuts**; nothing else about the commands changed.

- The agenda's git status no longer runs `git rev-parse` once per source file
  on every recomputation. Which repository holds a file was resolved file by
  file, and the answer "this directory is not under git" was not remembered at
  all, so a notes directory outside git cost one process per file of the view
  -- on every save in a watched directory, on every repository event and on
  every render. The answer is now kept per directory, negative answers
  included, and dropped when a repository is opened or closed.

- The extension now requires VS Code 1.101 or newer. It has been calling
  `getRepositoryRoot` on the built-in Git extension's API since the git status
  chip was written, and that member arrived in 1.101 -- on 1.85 to 1.100 the
  call landed on `undefined`, the error was swallowed by the chain's own
  handler, and the chip quietly went missing for notes reached through a
  symlink, which is the arrangement it exists for. Neither the compiler nor the
  test suite could see it: the API is reached through a declaration of our own,
  and the integration run downloads the current stable rather than the declared
  minimum. Both marketplaces keep serving older hosts the last version that
  supported them. The rule behind the choice is written down in
  [ADR-0018](docs/adr/0018-minimum-host-follows-the-git-api.md).

- `markdown-org.extractorPath` is read from user or machine settings only. It
  names an executable that the agenda and the calendar sync run, and until now
  a `.vscode/settings.json` inside an opened repository could name it -- so
  opening the agenda in a repository you had trusted once ran whatever that
  file pointed at. Trust is granted per repository, broadly, and answers a
  different question than "may this repository choose my binaries". If you keep
  a locally built extractor configured per workspace, move the value to your
  user settings; everything else is unchanged.

- The overdue backlog of a day is four panels instead of one: a missed repeat,
  what slipped within the week, what slipped earlier this year, and what is
  older than a year -- in that order, most actionable first. What a slipped
  entry asks of the reader differs with its age, and one "Overdue" heading over
  all of them buried a repeat missed yesterday under dates from years ago. A
  repeater outranks the age of the date it missed: whatever the date was, the
  work is the next occurrence. The same split, and for the same reason,
  `org-super-agenda` keeps `:scheduled past` apart.
- The demo recordings run their commands through the Command Palette: each one
  is opened by name, held on screen for three seconds and then accepted, so a
  viewer reads which command produces the change instead of matching it to a
  chord that may not be theirs. The palette lists the binding next to the
  command, so the shortcut is still shown. Where a step applies one command
  repeatedly to walk a value, only the first invocation goes through the
  palette.

### Fixed

- **Fixed.** The clocktable and the extractor's `total_clock_time` no longer
  disagree about the same file. Three differences in what a CLOCK line may look
  like are gone: a mixed bracket pair (`[…>`) was counted here and skipped
  there, a closed entry without the `=> H:MM` tail was skipped here and counted
  there, and a `<` inside a timestamp body was accepted here alone. The tail is
  optional as it is for the extractor, and each pair of brackets is now a pair.
  A line that says CLOCK but does not parse is also passed over instead of
  ending the heading's CLOCK block -- one such line used to hide every entry
  under it, which is how a single typo could take a whole day's clocking out of
  the table.

- **Fixed.** A calendar request no longer waits out three backoffs when the
  account is simply not connected or the grant was revoked. Getting the access
  token and sending the request sat in one `try`, and every failure there was
  read as "no response came back" -- a transient network fault worth retrying.
  An authorization failure is now its own kind of error, raised by the token
  endpoint on any 4xx and by the token provider when there are no stored
  credentials, and it goes straight to the caller. A 5xx from the token
  endpoint, and every other network fault, is retried exactly as before.

- **Fixed.** An action on a whole overdue band no longer reaches notes of a
  directory whose chip is off. The band was rebuilt on the extension side from
  the payload the view was built from -- the whole scan -- while the chips are
  answered in the page, so a reader who switched a directory off, saw three
  rows and pressed "move to today" had every row of the band rewritten,
  including the ones that were not on the screen. The chips that are off now
  travel with the message and narrow the band before it is turned into files,
  so the rows edited are exactly the rows shown.

- **Fixed.** Move to Archive and Promote to Maintain no longer report a move
  that did not happen. Both wrote the destination file first and then removed
  the block from the open document, discarding the answer to that removal --
  and the editor refuses an edit whenever the document has moved on since the
  edit was built, is read-only, or is claimed by another participant. The block
  then sat in both files while the toast said it had been moved. The order is
  reversed: the block is cut first, and the destination is written only after
  the editor confirms the cut; a refusal is reported and nothing is written. If
  writing the destination fails, the block goes back where it was. Both
  commands now have end-to-end coverage, the archive one for the first time.

- **Fixed.** A priority cookie the user typed away from the front of a heading
  is read, painted and toggled where it is, instead of being invisible to the
  commands. Toggling the priority on `## TODO Buy [#A] filter` used to add a
  second cookie -- the extension looked only right after the keyword -- and the
  colour stopped at the same boundary. The cookie is now found anywhere on the
  line, as the extractor finds it, so the toggle clears the one that is there
  (cutting it out in place, along with one separating space) and adds one only
  when the heading carries none. Group actions on such a task no longer refuse
  with "moved": the extractor now leaves a non-canonical cookie in the heading
  text it publishes, so the agenda's heading and the line in the file say the
  same thing. Requires the extractor 0.15.0 or newer.

- **Fixed.** Every number on the agenda is written in the digits of the date
  locale. The dates went through `Intl` while the counts beside them did not,
  so in a locale with non-Latin digits (ar-EG and its neighbours) a section
  whose tooltip read "١٢ tasks in this section" carried a chip reading "12",
  and the week view's clipping markers counted hidden rows in a third script
  again. The summary bar, the section chip and both clipping markers now use
  the same formatter as the dates and the month cells.

## 0.14.0 - 2026-08-09 (never released)

Never released on its own: the tag was never cut, so there is no `v0.14.0` to
install or compare against, and the heading carries no link for that reason --
everything below reached users as part of 0.15.0.

Four things this release is about: a Tasks view that says which day each of its
rows belongs to, org syntax that is coloured in the editor and not only in the
agenda, a week view that admits when a day continues past the edge of the panel,
and repeating tasks that move forward when marked DONE instead of closing.

### The Tasks view dates every row

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/agenda-tasks-dark.png">
    <img src="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/agenda-tasks-light.png" alt="Tasks view: open tasks grouped by priority, each row stating its own date">
</picture>

- **Changed.** Every row states its date, in full and with the year. The view
  lists tasks of every date at once, so a bare `09:30` named no day and a task
  with no time named nothing at all; the date now sits in the row's right edge,
  where the day and week views already put it.
- **Changed.** Only a date behind today is coloured; today's own date and the
  ones ahead stay in the muted meta colour -- with every row dated, colour is
  spent on what is late alone. The day and week views are unchanged: a date
  there appears only on a row that sits off the anchor day, and highlighting
  the ones ahead still says "not this day".
- **Changed.** The rows within one priority are ordered by date and then by
  time, with the file and the line as the tiebreaker. What has no time to sort
  by goes last at both levels: a task with no date after every dated one, and a
  whole-day task after the timed ones of its day -- the reading Emacs
  `org-agenda` gives a timeless entry. The order used to come from the walk over
  the tree, which is unspecified, so `09:30` could sit above `08:00` with
  nothing to explain it.
- **Changed.** The time column of a task with no clock time is empty again,
  instead of holding an em-dash. A task that runs all day is not a task whose
  time is missing, and the column keeps its width either way, so the rows stay
  aligned.

### Org syntax is coloured in the editor

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/editor-markdown-dark.png">
    <img src="https://github.com/VitalyOstanin/markdown-org-vscode/raw/HEAD/media/editor-markdown-light.png" alt="Editor view of a planning file with org constructs coloured">
</picture>

- **Added.** Planning keywords (`SCHEDULED`, `DEADLINE`, `CLOSED`, `CREATED`,
  `CLOCK`), every part of a timestamp (date, weekday, time, repeater, warning
  cookie), the status keyword on a heading and the `[#A]` / `[#B]` / `[#C]`
  cookies are coloured in the editor, in the colours the agenda already uses for
  the same things.
- **Added.** It works at any indentation. Four spaces or a tab make markdown
  read a line as an indented code block and highlight nothing inside it, while
  the extractor reads the planning line regardless -- so a line the agenda acts
  on used to sit colourless in the editor. This is why the colouring is editor
  decorations pointing at theme colour tokens (`charts.*`) rather than a
  grammar: a grammar can only name a scope and leave the colour to the theme,
  which is what kept the two views from agreeing.
- **Added.** The punctuation between the coloured parts (backticks, the
  keyword's colon, the timestamp brackets, a CLOCK range's `--` and its
  `=> H:MM` duration) keeps the theme's inline-code colour at any indentation --
  the colour it already had at shallow indentation.
- **Added.** `markdown-org.highlightInEditor` turns the decorations off. They
  cannot tell a planning line apart from the same text inside a real code block,
  so a documentation example is coloured too.

### The week view says what is out of sight

- **Added.** When a day holds more rows than fit, its header shows how many are
  out of sight: `↑ N` for the rows behind the pinned header and `↓ M` for those
  below the bottom of the panel, each with a tooltip spelling the count out.
- **Added.** A row counts as out of sight once less than half of it is inside
  the visible band -- that is where a task line stops showing its text -- so a
  row sliced to a strip of padding is counted while one merely cut at the edge
  is not. A day whose rows are all visible shows neither chip.
- **Added.** The header casts a shadow while it covers rows, so "this day
  continues above" reads without looking at the number.

### A repeating task moves forward instead of closing

- **Changed.** Marking a repeating task DONE now moves it forward, as Emacs
  Org-mode does (`org-auto-repeat-maybe`): the planning dates take one step
  (`+N`), step until
  they pass today (`++N`) or restart from today (`.+N`), and the keyword goes
  back to `TODO`.
- **Changed.** A heading that carried no keyword still carries none, a planning
  line without a repeater is left where it is, and clearing DONE or marking a
  task cancelled moves nothing.
- **Changed.** A `wd` (working days) repeater is refused with a message rather
  than approximated: working days depend on the public calendar, of which the
  extractor publishes the holidays but not the Saturdays moved to working, and
  counting without them would put the editor a day or two off the phone. See
  ADR-0017.

### The bundled extractor

- **Changed.** The bundled extractor is 0.14.0, up from 0.12.0. Besides the
  Tasks ordering above, a heading now keeps the text of an inline code span:
  ``## TODO `build` is broken`` shows as `build is broken` rather than as
  `is broken` -- the literal used to be dropped along with the backticks,
  taking a word out of the middle of the title.

### Fixed

- **Fixed.** The week view no longer opens with the first tasks of today hidden
  behind their own day header. Switching into Week from a scrolled view left the
  page where it was: the day header is `position: sticky`, and one that is
  already pinned reports its pinned box, so `scrollIntoView` concluded it was in
  place and moved nothing. The page now unpins the headers before measuring,
  inside the same frame -- the user still sees a single jump.
- **Fixed.** The same rows stayed visible when the panel header changes height
  right after the week was focused -- which it routinely does, because the git
  chip arrives on its own message a moment after the render. The day headers pin
  below the panel header, so growing it moved the pin point down onto rows that
  had just been brought into view. The week now keeps its focus through such a
  resize, and releases it as soon as the scroll position is the user's own.
- **Fixed.** A timestamp carrying a warning cookie (`<2026-01-12 Пн +1w -2d>`,
  the window in which a `DEADLINE:` starts showing up) is now parsed by the
  cursor engine. Shift+Up / Shift+Down used to do nothing on such a line, and
  the extractor had been reading it all along, so the agenda and the editor
  disagreed about the same file. The cookie survives a shift the way a repeater
  does.
- **Fixed.** A priority cookie written without a space after it
  (`## TODO [#A]Title`) is recognized. The extractor accepts that form, so the
  agenda showed a priority the commands could not see -- toggling would have
  added a second cookie.

## [0.13.0] - 2026-07-27

### Added

- Git status of the agenda's source files, in the panel header. A chip next to
  the tag filter counts the files of the current view that have uncommitted
  changes (`●`) and the files touched by commits that are not in the upstream
  (`↑`), and reads `✓ clean` when there is nothing pending. It expands to the
  files themselves, grouped as not committed / not pushed / clean / outside git,
  each row opening its file; the unpushed heading also names the commit count
  and the branch pair (`master → origin/master`) when the view sits in a single
  repository.
- Commit and push from that dropdown. The commit stages only the changed source
  files of the current view -- an unrelated edit elsewhere in the same
  repository is left alone -- and asks for a message with `agenda: <date>`
  pre-filled. Push sends the current branch to its upstream, asking first when
  the branch has none.
- Source files reached through a symlink are resolved to the repository behind
  them, including repositories outside the open workspace folders (they are
  opened on demand and appear in the Source Control view). No setting: the chip
  appears when the files are under git and the built-in Git extension is
  available, and is absent otherwise.

### Changed

- The README's agenda assets are reshot against the current header, and a new
  screenshot shows the git chip expanded to the files behind the view. The demo
  pipeline gained what that needed: every run starts from an empty workspace
  (the driver deletes the previous one along with its remote), the agenda
  scenario seeds a repository with one file committed but not pushed and one
  edited but not committed, screenshots switch views by invoking the command
  instead of typing into the Command Palette -- which on a loaded machine could
  lose the query and photograph an empty palette -- and they no longer draw the
  mouse pointer.

### Removed

- The Back / Forward buttons for the agenda view history. The header held two
  arrow pairs side by side -- history and date navigation -- and the unlabelled
  first pair read as "previous day". The history itself is unchanged and stays
  available as `Markdown Org: Go Back in Agenda` (`Alt+Shift+-`) and
  `Markdown Org: Go Forward in Agenda` (`Alt+Shift+=`).

## [0.12.0] - 2026-07-26

### Added

- `markdown-org.uiLanguage` (`auto` | `en` | `ru`, default `auto`): language of
  the agenda interface -- mode buttons, navigation, section and group titles,
  summary counts, and tooltips. `auto` follows `markdown-org.dateLocale` first,
  then the VS Code display language, then English, so a `ru-RU` date locale now
  also gives a Russian interface. Dates keep following `dateLocale`.
- `markdown-org.agendaFontFamily` to override the proportional agenda font.
  Empty (default) uses `'Adwaita Sans', 'Noto Sans', system-ui, sans-serif`.
- `markdown-org.agendaHeaderMode` (`auto` | `full` | `compact`, default `auto`):
  a compact agenda header that puts the weekday or month title on the control
  row and tightens the spacing, for panels short enough that the full header --
  about a fifth of the height -- crowds out the tasks below it. `auto` decides by
  what the full header actually costs: it goes compact once that header would
  take a fifth of the panel and back once it would take under 0.15 of it, and
  follows the panel as it is resized. The two other values pin the layout. No
  control is hidden in either layout. A chip in the control row cycles the three
  values and names the current one; the same step is in the Command Palette as
  `Cycle Agenda Header Layout`. The layout is worth changing exactly when the
  panel is too short to spare a trip to the settings editor.
- Hotkeys for the two agenda views that had none, so all four are reachable from
  the keyboard: `Ctrl+K Ctrl+K Ctrl+Y` (Day) and `Ctrl+K Ctrl+K Ctrl+L` (Tasks).
  Like Week and Month, they work both in a Markdown editor and while the agenda
  panel has focus.
- Agenda view history with `Markdown Org: Go Back in Agenda` (`Alt+Shift+-`) and
  `Markdown Org: Go Forward in Agenda` (`Alt+Shift+=`), which replay the mode and
  anchor date of the views you opened. Both are ordinary keybindings scoped to
  the agenda panel, so they show up in Keyboard Shortcuts and can be rebound.
  The control row carries the pair as buttons as well, each naming its chord in
  the tooltip: the two commands were reachable only by a chord nothing in the
  panel mentioned.

### Fixed

- The agenda now tells the extractor which day is "today" (`--current-date`)
  instead of leaving it to the extractor's own timezone default of
  `Europe/Moscow`. Only the window anchor was being passed, so users whose
  calendar day differs from Moscow's at the moment of the call saw the
  neighbouring day's agenda: tasks moved to overdue a day early or lingered in
  upcoming, and the next occurrence of a repeating task was named one day off.
- Numbers on the agenda follow the date locale's numbering system, like the
  dates beside them. The year in the header subtitle, the day numbers and count
  chips of the month grid, and the card summary counts were printed as raw
  numbers, so a locale with non-Latin digits (for example `ar-EG`) mixed the two
  systems within one line.
- An agenda left open across midnight now moves to the new day. The refresh kept
  the anchor the panel was opened with, so a day view still showed yesterday, a
  week view the previous week on the Sunday-to-Monday step, and a month view the
  previous month on the 31st. A panel the user had navigated elsewhere keeps its
  anchor and is only refreshed.
- CLOCK lines with unusual spacing around `=>` or after `CLOCK:` are counted in
  the clocktable. The extractor already accepted them, so the same file could
  produce two different totals depending on which of the two read it.
- The compact agenda header now actually places the title on the control row.
  The rule that was meant to move it had no effect on a block container, so the
  layout only shrank the type -- the header still spent a line on the title, in
  the one case where the setting exists to reclaim it. A narrow panel keeps that
  layout too: the header row no longer wraps the controls back onto a line of
  their own when the title and the controls do not both fit, they share the row
  and the controls wrap within it.
- Agenda webview escaping now covers quotes. Values interpolated into quoted
  HTML attributes (`data-file`, `data-priority`, `title`, ...) went through an
  escape that left `"` and `'` untouched, so a task file whose name contained a
  double quote could close its attribute and inject another one -- a duplicate
  `data-line` wins over the real one when the tag is parsed, sending a click to
  a different location. The escape is now a string replacement covering
  `& < > " '`, which also removes a DOM round-trip performed 10-12 times per
  rendered task line.
- The anchor date posted by the webview is validated as a real `YYYY-MM-DD`
  calendar day before it reaches the extractor's `--date` argument.
- Month navigation no longer skips short months. Prev/Next shifted the anchor
  date itself, so from the 31st the step landed past a 30-day month and February
  was unreachable from the 29th onward; the anchor is now taken to day 1 of the
  target month.
- Google Calendar sync survives transient failures instead of reporting a broken
  sync: 429 and 5xx responses are retried with capped exponential backoff that
  honours `Retry-After`. Per-task failure reasons are written to the sync
  channel rather than dropped, the sync-on-save handler no longer swallows
  errors raised before the sync starts, and the cross-process lock rewrites its
  heartbeat atomically (temp file plus rename) so a concurrent reader cannot see
  a truncated lock file and take the lock from a running sync.
- An invalid `markdown-org.dateLocale` no longer empties the agenda. A tag
  `Intl` refuses (`ru_RU` for `ru-RU`) threw during rendering and left a blank
  panel with no message; the value is now checked once, falls back to `en-US`,
  and is reported in a warning that names the rejected setting.
- A failure inside the agenda page is now reported instead of showing an empty
  panel: the webview forwards render errors (and any uncaught error or rejected
  promise) to the extension, which surfaces one message per panel. Previously
  such a failure was only visible in the webview developer console.
- The week view no longer throws when the extractor returns something other
  than a list of days; it renders empty, like the other views already did.
- A failure to open the panel is reported as such instead of as
  "Failed to load agenda", which pointed at the extractor.
- The reason holidays could not be loaded is written to the "Markdown Org"
  output channel. The agenda still renders without them (an older extractor has
  no `--holidays`), but a broken binary is no longer indistinguishable from an
  old one.
- Clicking a task in the agenda opens it once again. The click handler was
  attached to the (permanent) content element on every render, so each refresh
  -- one per save of a watched `.md` file -- stacked another handler, and a
  single click then opened the same task once per accumulated render.
- `markdown-org.agendaFontFamily` is validated before it is written into the
  agenda stylesheet: only a plain font stack is accepted, anything carrying CSS
  syntax (braces, semicolons, `url(...)`, comments) is ignored in favour of the
  default. Changing the setting now re-renders an open agenda instead of taking
  effect only in the next panel, and its description names the actual default
  stack.

### Changed

- Dates the agenda writes itself now follow `markdown-org.dateLocale` instead of
  always using a day-first `DD.MM.YYYY`: the offset column and the flag tooltips
  show `08/12/2026` for `en-US` and `12.08.2026` for `ru-RU`, matching the day
  headers and the hero title, which already went through the locale.
- Changing `markdown-org.dateLocale` with the agenda open now also changes the
  dates. Only the labels followed before, leaving a half-translated panel until
  the panel was reopened.
- `markdown-org.uiLanguage: auto` now reaches its second step. The date locale
  is consulted only when you actually set it, so a Russian VS Code with default
  settings gets a Russian agenda -- previously the setting's own `en-US` default
  matched first and the display language never applied.
- Documented what the UI language covers: the agenda panel. Notification
  messages the extension raises through VS Code stay in English.
- README screenshots and demo recordings were recaptured against the current
  interface, and now ship in two editor themes -- Monokai and Solarized Light.
  Each one is embedded through `<picture>` with `prefers-color-scheme`, so a
  renderer that honours the media query (GitHub does) serves the set matching
  the reader's own colour scheme; elsewhere the light variant is the fallback.
  The recording scripts take the theme as an argument and record both by
  default.
- The VSIX no longer carries the demo GIFs. In two themes they come to about
  20 MB, shipped four times over (one package per platform) to save a network
  fetch in a single place -- the in-editor Extensions preview. Every README
  embed loads from GitHub anyway: packaging rewrites image sources to absolute
  URLs. The package is back to 2.77 MB.
- Bundled extractor bumped from 0.10.0 to 0.11.0, which resolves the next
  still-upcoming occurrence of a repeating task (`timestamp_next`). The repeat
  tooltip now names that date, instead of the stored timestamp, which for an
  overdue task lies in the past. Where the extractor emits no resolved
  occurrence -- the Tasks view, which carries no dates at all, or an older
  extractor -- the tooltip names the task's own date ("dated 12.08.2026")
  rather than passing it off as the next one. For an hourly repeater the
  resolved occurrence is a whole day, so the tooltip shows the date without a
  clock time.
- Removed what was left of the multi-preset agenda: the `data-agenda-style` hook
  on the body and every selector scoped to it, the hidden `todo:` label, the
  stacked time-info cell (and the whole `buildTimeInfo` computation that filled
  it for every task row), and the today arrows in the day header. Rules that
  could never apply are gone with them, so the stylesheet now says once what the
  agenda looks like.
- Redesigned the agenda: one compact list style where each task carries a status
  dot, a large time, and a type-flag column (deadline / scheduled / repeat /
  cancelled). The Day and Tasks views are cards -- a sticky summary bar plus
  section panels with count chips (by time of day, and by priority in Tasks) --
  and the month calendar shows per-day task counts (red when a day holds
  something overdue) instead of a binary dot.
- The sticky top bar groups Prev / Today / Next as a secondary segment next to
  the mode switch, and day headers pin below it while their tasks scroll.
  Clicking a week day header opens that day in Day view.
- The hero date in the agenda header is capitalised regardless of how the
  locale spells the weekday.
- Every clickable surface of the agenda is now a button, not a `<div>` with a
  click handler: the tag dropdown rows and the month cells join the mode
  segment, so they take keyboard focus and respond to Enter/Space. One focus
  ring covers all of them -- the mode segment had none at all.
- The two count chips that are the same component now look the same: the month
  cell's task load and the card section count shared no shape (20px/0.78em
  against 22px/0.8em) and only one of them explained its number. Both take the
  shared size and both carry a tooltip; the month cell itself carries the same
  "open this day" tooltip the week day header always had.
- Corner radii and font sizes in the agenda stylesheet come from token scales
  (`--radius-sm/-md/-pill`, `--font-xs..-xl`) like the spacing scale already
  did, replacing four ad-hoc radii and ten nearly identical font steps. The tag
  dropdown panel picks up the rounding and shadow it was missing under its
  rounded trigger.
- `Markdown Org: Agenda: Go Back` and `... Go Forward` are now
  `Markdown Org: Go Back in Agenda` / `Go Forward in Agenda`: the Command
  Palette showed the category twice.
- Documented in the README which VS Code default chords the extension's
  bindings deliberately shadow, and where.
- The agenda is proportional throughout: the previous monospaced grid is gone,
  and numeric columns line up via `tabular-nums` instead of a mono font. All
  colors still come from VS Code theme tokens, so light / dark / high-contrast
  themes are followed.

### Internal

- The three settings that name an executable or a directory --
  `markdown-org.extractorPath`, `markdown-org.maintainFilePath` and
  `markdown-org.workspaceDir` -- are declared as
  `restrictedConfigurations`, so a workspace opened in Restricted Mode cannot
  supply them. `extractorPath` is a path the extension spawns; a repository
  carrying a `.vscode/settings.json` could point it at a binary of its own and
  have opening the agenda run it.
- The release archive of the bundled extractor is pinned by SHA-256
  (`x-markdown-org.extractorSha256`, one digest per platform target) and
  `scripts/download-extractor.sh` refuses to install an archive that does not
  match. The script already compared the archive against the `.sha256` file
  published beside it, which detects a corrupted download but not a replaced
  asset -- both come from the same release page. A digest recorded in this
  repository is an independent anchor.
- A Google Calendar sync run now has a time budget of five minutes and reports
  in the sync channel when it stops early, instead of walking the whole task
  list however long that takes: a large workspace behind a rate-limited account
  spent the backoff waits of every task in one run. Retries also cover the case
  where there is no response at all -- a dropped connection, a DNS or TLS
  failure -- which used to bypass the retry loop that only ever looked at status
  codes. The backoff is spread by a random factor, since several windows share
  the account but not the lock and a common 429 had them retry in lockstep, and
  a wait in progress is interrupted when the run loses its lock rather than
  sleeping the remaining seconds out.
- `tsconfig.webview.json` is excluded from the VSIX. Only the host `tsconfig.json`
  was, so the second project's configuration shipped to every user.
- `.vscode/launch.json` and `.vscode/tasks.json` are in the repository, so F5
  starts an Extension Development Host with both TypeScript projects built
  first. `DEVELOPMENT.md` described the flow but the configuration it needs was
  never committed.
- The integration suites wait on a shared set of conditions
  (`src/test/integration/_helpers.ts`) instead of each file re-implementing its
  own polling, and the agenda client memoises the date titles it formats: the
  month grid asked `Intl` for the same 35 strings on every render.
- The VSIX now carries the licence notices of the crates linked into the
  bundled extractor, as `bin/THIRD-PARTY-LICENSES.markdown-org-extract.txt`.
  The binary is statically linked and around a hundred crates end up inside
  it; several of their licences (BSD-2-Clause, BSD-3-Clause/WHATWG, the
  Unicode ones, plain MIT) require the notice to travel with a binary
  redistribution, and only the extractor's own `LICENSE` was shipped. The
  notice file is generated in `markdown-org-extract` from its dependency
  graph and rides in its release archives from 0.11.1 on;
  `scripts/download-extractor.sh` unpacks it next to the binary and the
  release smoke test requires the path. The pinned extractor version moves
  from 0.11.0 to 0.11.1 (no behaviour change in the binary).
- The release workflow now runs the same tests as CI. It never downloaded the
  bundled extractor, so the suite that checks the binary runs and matches the
  pinned version skipped itself on the one path that publishes; it also has the
  VS Code build cache CI has. Both cache keys carry an ISO week, because the
  downloaded build is `stable` and nothing hashed changes when it moves.
- Every `actions/checkout` sets `persist-credentials: false`. No job runs git
  operations after checkout, so leaving the token in `.git/config` only exposed
  it to later steps -- including the publish job, whose token can write to the
  repository and whose `ovsx` CLI is fetched at run time. That CLI is now pinned
  to 1.0.2 (was 0.10.12; the 1.0.0 release carried dependency bumps only).
- The integration coverage gate now measures the host code only. The webview
  client sat in the denominator at 20% of lines and 0% of functions -- the file
  being read for inlining, not executed -- pinning 13% of the total at a number
  no test could move. With it excluded the same run reports 80% of lines instead
  of 72%, and the floors were raised from 70/68/73 to 78/68/73.
- Documentation corrections: the "Shadowed VS Code chords" table named the wrong
  default for two rows (`Ctrl+K Ctrl+P` shadows Show All Editors By Appearance,
  not Copy Path; `Ctrl+K Ctrl+M` shadows Toggle Maximize Editor Group, not
  Change Language Mode) and did not mention the `Ctrl+K Ctrl+K` prefix or that
  Cycle Tag Filter takes it in every editor; the `src/` tree in DEVELOPMENT.md
  listed a directory removed with the old test runner and omitted two that
  exist; ADR-0012 was missing its `Status` section.
- Two ADRs recorded: [ADR-0015](docs/adr/0015-pin-today-with-current-date.md)
  (pin "today" with `--current-date`), which supersedes ADR-0007, whose stated
  contract with the extractor did not hold.
- The agenda webview client moved out of the HTML template literal into
  `src/webview/agendaClient.ts`, a TypeScript project of its own (`lib: dom`,
  referenced from the host `tsconfig.json`; `npm run compile` is now `tsc -b`).
  The ~780 lines that ran in the page were previously invisible to `tsc`, ESLint
  and Prettier; they are now checked like the rest of the source. The helpers
  inlined next to the client are type-checked against the contract it is written
  against, so a changed signature fails the build instead of the page. See
  [ADR-0012](docs/adr/0012-webview-client-as-a-typed-project.md).
- Two decisions this release rests on are written down as ADRs:
  [ADR-0013](docs/adr/0013-agenda-ui-language-own-dictionary.md) (the agenda's
  own UI language setting and dictionary instead of `vscode.l10n`, because the
  panel follows the date locale rather than the editor display language) and
  [ADR-0014](docs/adr/0014-single-agenda-style.md) (one agenda look, no style
  switcher).
- Coverage thresholds now actually gate. The CI coverage job was
  `continue-on-error`, so a drop through a floor was invisible; only the Codecov
  uploads stay non-blocking now. The unit profile excludes modules that cannot
  load without a VS Code host (they used to sit in the denominator as permanent
  zeros, holding the floor down to 48%; it is 95% lines / 92% branches / 96%
  functions now), and the integration run -- which covers those modules -- got a
  gate of its own, since `@vscode/test-cli` emits lcov but has no threshold
  option (`scripts/check-lcov-thresholds.js`).
- Google Calendar sync stops writing when it no longer holds the lock. A failed
  lock heartbeat used to be swallowed, so the lease quietly stopped being
  renewed and, once it went stale, a second window could take the lock and run
  a parallel pass over the same files and the same calendar. Failures are now
  reported to the sync channel and abort the run after three in a row; a lock
  file that cannot be read (as opposed to one that is absent) is no longer
  treated as free.
- One transient retry no longer drags a token refresh along: after a 401, every
  later 429/5xx retry of the same call was forcing a fresh token, up to three
  needless round trips to the token endpoint.
- A `markdown-org.extractorPath` pointing at an extractor older than the one
  this release expects is now reported once, naming both versions. An old
  binary answers every call the agenda makes and simply omits fields added
  later, so the panel rendered as if those tasks had no repeater and no next
  occurrence -- indistinguishable from tasks that genuinely have neither. A
  binary that cannot report its version is not treated as outdated.
- The CLOCK table accepts exactly what the extractor accepts: a negative
  duration (`=> -2:00`), a minutes field of 60 or more and anything past the
  10000-hour bound are dropped instead of being summed. The two projects read
  the same lines off disk and used to disagree on the total for one file.
- README: the repeater documentation matches the shipped behaviour. `+Nh` in
  the agenda means "every day, N ignored" (the agenda is a day grid), while
  Google Calendar sync maps it to `FREQ=HOURLY;INTERVAL=N`; and the sync
  limitation "repeaters collapse to one event" is gone -- they became real
  recurring events in 0.11.0, with `+Nwd` (N > 1) the one shape that stays
  one-shot.
- The VSIX now carries the bundled extractor's own MIT notice next to the
  binary (`bin/LICENSE.markdown-org-extract`), checked by the release smoke
  test. `markdown-org-extract` is a separate work with its own copyright line,
  so the extension's `LICENSE.txt` does not cover it. Aggregated notices for
  the crates linked into that binary are tracked in `TODO.md`.
- Dependencies: `npm audit` reports no vulnerabilities (eight advisories in the
  dev tree, seven of them high, were closed by updates plus one `overrides`
  entry). `@types/vscode` is pinned to the exact `engines.vscode` minimum, so
  the API surface the code compiles against is the one the manifest promises --
  a caret range had it building against 1.120 while claiming 1.85. The build
  and test runtime moves to Node 24, the active LTS line (this affects
  development only; the extension runs on VS Code's own Node). ESLint,
  Prettier, typescript-eslint, sinon, c8, vsce and both `@vscode/test-*`
  packages updated; the audit steps in CI now scan the dev tree, which is the
  entire dependency surface -- there are no production dependencies, so the
  previous `--omit=dev` scan passed by construction.
- The build moved off `moduleResolution: node10`, deprecated and slated for
  removal in TypeScript 7, to `node16` in both projects; the emitted output is
  still CommonJS, as the extension host requires. `noImplicitOverride` is on.
- Type-aware linting is on (`recommendedTypeChecked` with the project service),
  so rules that need type information -- floating promises, misused promises,
  unnecessary assertions -- actually run; they were silently skipped before.
  `eslint .` now also covers the `.js`/`.mjs` scripts and configs, which were
  outside the lint scope entirely, and `eqeqeq` is enforced.
- CI now fetches the bundled extractor before the tests, so the suite that
  checks the binary runs and that its version matches
  `x-markdown-org.extractorVersion` stops skipping itself. It had been skipping
  in every CI run (four "pending") while passing on developer machines, which
  is exactly where a version mismatch would have gone unnoticed.
- CI hardening: `id-token: write` (CI) and `contents: write` (release) are
  scoped to the single job that needs each, instead of being granted to every
  job -- including those that run `npm ci` and unpack a downloaded binary. The
  `workflow_dispatch` tag input reaches shell scripts through the environment
  rather than `${{ }}` interpolation. The VS Code build used by the integration
  tests is cached (~295 MB, previously re-downloaded four times per run), and
  the runner is checked for `xvfb-run` instead of discovering its absence as an
  Electron display error. npm is now covered by Dependabot; it had only the
  weekly report workflows, which print to a log and open nothing.
- `--ozone-platform=x11` is passed to the test VS Code on Linux only, matching
  the environment the test wrapper sets; Ozone does not exist on macOS or
  Windows.
- The agenda integration suite waits for the panel to render instead of sleeping
  a fixed 300 ms after each command: fewer flakes on a loaded machine and the
  suite runs in about half the time.
- New contract test: every command declared in `contributes.commands` must be
  registered at runtime, so a manifest entry with no `registerCommand` fails the
  build instead of showing up as "command not found" in the palette.
- Documentation brought back in step with the code: the month-calendar notes
  describe the count chip and theme tokens rather than the removed dot and
  hardcoded hex colours, `DEVELOPMENT.md` describes `src/` by directory (the
  hand-listed file tree had gone stale) and states that the integration runner
  starts `xvfb-run` itself on any Linux session, and two broken links (one in
  this file, one in ADR-0004) now point at existing anchors.

## [0.11.1] - 2026-07-18

### Changed

- CI maintenance only; no user-facing extension changes. Bumped pinned GitHub
  Actions in the `github-actions` group: `actions/setup-node` 6.4.0 → 7.0.0 and
  `softprops/action-gh-release` 3.0.1 → 3.0.2.

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
- README's Quick Start no longer requires a separate `cargo install`. The "Dependencies" section now documents the bundled binary and points the override scenarios to [`markdown-org.extractorPath`](README.md#markdown-orgextractorpath).

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

- Hardened the release/CI surface end-to-end against a long-form audit (100+ findings, all closed):
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

[Unreleased]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.18.0...HEAD
[0.18.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.13.0...v0.15.0
[0.13.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/VitalyOstanin/markdown-org-vscode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/VitalyOstanin/markdown-org-vscode/releases/tag/v0.1.0
