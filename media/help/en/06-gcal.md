# Google Calendar sync

The sync is one-way and opt-in: scheduled tasks become events of a calendar,
and nothing in the calendar is read back into the files. It exists so that a
phone with no notes on it still shows what the day holds.

## Connecting

- `markdown-org.gcalSync.connect` -- **Connect Google Calendar** asks for the
  credentials and stores the secret in the OS keychain, never in the settings.
- `markdown-org.gcalSync.selectCalendar` -- **Select Google Calendar** picks
  which calendar the events go to and pins it.
- `markdown-org.gcalSync.disconnect` -- **Disconnect Google Calendar** forgets
  the token.
- `markdown-org.gcalSync.syncNow` -- **Sync Now (Google Calendar)** runs a sync
  at once.

| Setting                              | What it decides                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `markdown-org.gcalSync.authProvider` | where the access token comes from: your own OAuth client, GNOME Online Accounts, or whichever of the two fits |
| `markdown-org.gcalSync.clientId`     | the OAuth Desktop client id, when the token is your own client's                                              |
| `markdown-org.gcalSync.goaAccount`   | which GNOME Online Accounts account to take the token from                                                    |
| `markdown-org.gcalSync.calendarName` | the name a calendar is found or created under when none is pinned                                             |
| `markdown-org.gcalSync.calendarId`   | the pinned calendar, which wins over the name                                                                 |

## What is written, and when

| Setting                                      | What it decides                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `markdown-org.gcalSync.syncOnSave`           | whether saving a markdown file starts a sync                             |
| `markdown-org.gcalSync.syncOnSaveDebounceMs` | how long that trigger waits for the typing to stop                       |
| `markdown-org.gcalSync.concurrencyPolicy`    | what a sync requested while one runs does: queue behind it, or cancel it |
| `markdown-org.gcalSync.onDone`               | what happens to the event of a task that became `DONE`: deleted, or left |
| `markdown-org.gcalSync.defaultEventMinutes`  | how long an event lasts when the task names an hour but no end           |

A repeating task becomes a recurring event, and what the entry says about a
single occurrence goes with it: the days it cancels itself are excluded, and a
day it holds elsewhere becomes an event of its own. A move taken back out of
the notes takes its event with it on the next sync.
