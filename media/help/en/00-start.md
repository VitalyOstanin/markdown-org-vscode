# Where to start

This extension keeps tasks in ordinary markdown files: a heading with a keyword
in front of it is a task, a line under it says when it is due, and the agenda
panel draws what falls on a day. Nothing is stored anywhere else, so the tasks
travel with the repository the notes are in and are read by the Android client
over the same files.

`markdown-org.showHelp` -- **Help** opens this panel. It speaks the language
`markdown-org.uiLanguage` names, which is the language the agenda speaks; the
pages themselves ship with the extension, so there is nothing to fetch.

## The shortest way in

1. Point `markdown-org.workspaceDirs` at the directory the notes are in.
2. Write a heading, say `## TODO Renew the TLS certificate`.
3. Put the cursor in it and run **Insert SCHEDULED Timestamp**.
4. Open **Show Agenda (Day)**.

Or say the whole of it in one sentence: **Insert Task from Phrase**, then
"renew the TLS certificate tomorrow at 15:00, every week".

## What the pages hold

| Page                 | What it answers                                                  |
| -------------------- | ---------------------------------------------------------------- |
| Tasks and priorities | what makes a heading a task, and how it is ordered               |
| Timestamps           | the planning lines, the two kinds of brackets, and tracking time |
| Repeating tasks      | repeaters, and one occurrence moved or cancelled                 |
| The agenda           | the views, where the tasks come from, and how a day is laid out  |
| Writing by phrase    | a task said in one sentence, and an entry changed the same way   |
| Google Calendar      | what the one-way sync writes, and when                           |
| The git chip         | what the counts mean and what the four actions do                |
| Every setting        | the whole list, with what each one decides                       |
