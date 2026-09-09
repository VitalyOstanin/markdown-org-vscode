# The agenda and its views

The agenda is a panel of the extension's own. It reads the files under the
directories the settings name, through the same extractor the Android client
links, and draws what falls on the days it is showing.

| Command                        | View                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `markdown-org.showAgendaDay`   | **Show Agenda (Day)** -- one day on an hour axis       |
| `markdown-org.showAgendaWeek`  | **Show Agenda (Week)** -- seven days beside each other |
| `markdown-org.showAgendaMonth` | **Show Agenda (Month)** -- a calendar of the month     |
| `markdown-org.showTasks`       | **Show Tasks** -- everything open, without the days    |

## Where the tasks come from

- `markdown-org.workspaceDirs` lists the directories to sweep, and shows them
  as one agenda; every task keeps a coloured mark naming the directory it came
  from.
- `markdown-org.workspaceDir` is the single-directory form, read when the list
  above is empty.
- `markdown-org.extractorPath` points at a build of the extractor of your own;
  empty means the binary shipped inside this extension.

## Moving about

- `markdown-org.agendaBack` -- **Go Back in Agenda** and
  `markdown-org.agendaForward` -- **Go Forward in Agenda** step through the
  views visited, the way a browser does.
- `markdown-org.agendaFindNext` -- **Find Next in Agenda** and
  `markdown-org.agendaFindPrevious` -- **Find Previous in Agenda** move between
  the matches of the panel's own find widget, which `Ctrl+F` opens over the
  rendered agenda.

Clicking a row opens the file at the entry. Clicking the flag of a row offers
what can be done to it without leaving the panel.

## How a day is laid out

- `markdown-org.agendaGrouping` decides whether a day is broken into sections
  with headings, or given as rows alone -- the headings name what a row is and
  offer the group actions, dropping them fits more on the screen.
- `markdown-org.agendaHeaderMode` chooses the header: the full one takes about
  a fifth of a short panel, the compact one puts the date on one line.
- `markdown-org.cycleAgendaHeaderMode` -- **Cycle Agenda Header Layout** and
  `markdown-org.cycleAgendaGrouping` -- **Toggle Agenda Day Sections** step the
  two settings from the panel.
- `markdown-org.firstDayOfWeek` sets which day a week and a month calendar
  start on.
- `markdown-org.agendaFontFamily` is the proportional font stack the panel
  draws with; empty means the built-in one.
- `markdown-org.uiLanguage` is the language of the panel itself -- its buttons,
  section titles, tooltips and the messages of the actions started from it.
  `auto` follows the date locale first, then the editor's display language.
- `markdown-org.highlightInEditor` colours the org constructs in a markdown
  editor with the colours the agenda uses.
