# Every setting in one list

The settings live under `markdown-org` in the usual VS Code settings, and the
sections above say where each one matters. This page is the list itself, with
what each one decides and what it holds when nothing is set.

## The files the agenda reads

| Setting                         | Default                  | What it decides                                                                         |
| ------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `markdown-org.workspaceDirs`    | empty                    | the directories swept and shown as one agenda, each with a colour of its own            |
| `markdown-org.workspaceDir`     | empty                    | the single directory, read when the list above is empty; empty means the workspace root |
| `markdown-org.maintainFilePath` | empty                    | the file **Promote to Maintain** moves a heading into; empty turns the command off      |
| `markdown-org.extractorPath`    | empty                    | a build of the extractor of your own; empty uses the one shipped inside the extension   |
| `markdown-org.fileTags`         | `ALL`, `WORK`, `PRIVATE` | the tags over file names, merged with the ones each notes directory declares            |
| `markdown-org.currentTag`       | `ALL`                    | the tag in force; a workspace remembers its own                                         |

## Dates and language

| Setting                       | Default  | What it decides                                                          |
| ----------------------------- | -------- | ------------------------------------------------------------------------ |
| `markdown-org.dateLocale`     | `en-US`  | how the dates the agenda shows are formatted                             |
| `markdown-org.weekdayLocale`  | `ru`     | the language of the weekday written into a timestamp: `Пн` or `Mon`      |
| `markdown-org.uiLanguage`     | `auto`   | the language of the panel and of the messages of actions started from it |
| `markdown-org.firstDayOfWeek` | `monday` | the day a week and a month calendar start on                             |

## How the agenda looks

| Setting                          | Default    | What it decides                                                             |
| -------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `markdown-org.agendaGrouping`    | `sections` | whether a day is broken into sections with headings, or given as rows alone |
| `markdown-org.agendaHeaderMode`  | `auto`     | the full header or the compact one                                          |
| `markdown-org.agendaFontFamily`  | empty      | the proportional font stack the panel draws with                            |
| `markdown-org.highlightInEditor` | `true`     | whether org constructs are coloured in a markdown editor                    |

## Time tracking

| Setting                          | Default | What it decides                                                                   |
| -------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `markdown-org.clockRoundMinutes` | `0`     | the minutes a written `CLOCK` stamp is rounded to; `0` writes the minute as it is |

## Google Calendar

| Setting                                      | Default        | What it decides                                                  |
| -------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| `markdown-org.gcalSync.authProvider`         | `auto`         | where the access token comes from                                |
| `markdown-org.gcalSync.clientId`             | empty          | the OAuth Desktop client id, when the token is your own client's |
| `markdown-org.gcalSync.goaAccount`           | empty          | which GNOME Online Accounts account to take the token from       |
| `markdown-org.gcalSync.calendarName`         | `markdown-org` | the name a calendar is found or created under                    |
| `markdown-org.gcalSync.calendarId`           | empty          | the pinned calendar, which wins over the name                    |
| `markdown-org.gcalSync.syncOnSave`           | `false`        | whether saving a markdown file starts a sync                     |
| `markdown-org.gcalSync.syncOnSaveDebounceMs` | `5000`         | how long that trigger waits for the typing to stop               |
| `markdown-org.gcalSync.concurrencyPolicy`    | `queue`        | what a sync requested while one runs does                        |
| `markdown-org.gcalSync.onDone`               | `delete`       | what happens to the event of a task that became `DONE`           |
| `markdown-org.gcalSync.defaultEventMinutes`  | `60`           | how long an event lasts when no end is given                     |
