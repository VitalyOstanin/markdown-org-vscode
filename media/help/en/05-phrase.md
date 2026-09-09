# Writing and changing an entry by saying it

A task is a heading with a keyword, sometimes a priority cookie, and a planning
line under it carrying a date, an hour and a repeater. Typed by hand that is
half a dozen commands; said in one sentence it is one.

- `markdown-org.insertTaskFromPhrase` -- **Insert Task from Phrase** writes a
  new entry from a sentence.
- `markdown-org.editTaskFromPhrase` -- **Edit Task from Phrase** changes the
  entry the cursor is in, by a sentence saying what to change.

Saying "позвонить врачу завтра в 15:00, каждую неделю" writes:

```markdown
### TODO позвонить врачу
    `CREATED: [2026-08-31 Пн 14:01]`
    `SCHEDULED: <2026-09-01 Вт 15:00 +1w>`
```

## How the box behaves

| What                   | How it behaves                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| the box after a phrase | reopens with the lines that would be written in its title, so the fields are seen before the file gets them |
| another phrase         | refines the first: "в 16:00" moves the hour and leaves the day and the repeater alone                       |
| Enter on an empty box  | writes the entry; Escape leaves the file untouched                                                          |
| where the entry goes   | into the note the cursor stands in, one level deeper, after everything already under it                     |

## A reminder said in the sentence

A sentence saying how long before its date the entry wants to be told writes
that as a property of the entry -- the `REMINDER` key of its `org-properties`
block, which is where the extractor reads it from and where the Android client
writes it. "позвонить врачу завтра в 15:00, напомни за час" adds:

````markdown
    ```org-properties
    REMINDER: 1h
    ```
````

The value is a count and a unit -- `30min` for minutes, `2h`, `3d`, `1w`, `1m`
for a calendar month, `1y` -- and the agenda names it in the tooltip of the
time column. "убрать напоминание" takes the key back out, with the block when
it held nothing else.

## Both languages, whatever the editor speaks

The rules that read the sentence are the extractor's, so this extension and the
Android client understand a phrase the same way, and both grammars -- Russian
and English -- are consulted whatever language the editor is set to. What the
rules understand, and what they do not, is listed in
[the extractor's own table](https://github.com/VitalyOstanin/markdown-org-extract#what-the-rules-understand).
