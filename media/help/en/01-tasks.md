# Tasks and priorities

A task is a markdown heading whose text starts with a keyword. Nothing else
marks it: the file stays a markdown file, and a reader who never installs this
extension sees a heading with a word in front of it.

```markdown
## TODO [#A] Renew the TLS certificate
SCHEDULED: <2026-09-09 Wed>
```

## The keywords

| Keyword     | What it means                                    |
| ----------- | ------------------------------------------------ |
| `TODO`      | open, and the agenda shows it until it is closed |
| `DONE`      | closed as finished                               |
| `CANCELLED` | closed as dropped, and counted apart from `DONE` |

Three commands set them on the heading the cursor is in, and a fourth removes
the keyword when the heading is not a task after all:

- `markdown-org.setTodo` -- **Set TODO**
- `markdown-org.setDone` -- **Set DONE**, which also closes the repeat of a
  repeating task rather than the task itself; see the repeaters section
- `markdown-org.setCancelled` -- **Set CANCELLED**

Running the same command again on a heading that already carries the keyword
takes it off, so the pair of commands is enough to move a heading in and out of
the agenda.

## Priorities

A priority is a cookie right after the keyword: `[#A]`, `[#B]`, `[#C]`, or a
number from `[#0]` to `[#64]`. Letters and numbers order together -- `A` is
`0`, `B` is `1`, `C` is `2 `-- so a file may use whichever of the two reads
better.

- `markdown-org.togglePriority` -- **Toggle Priority** steps A, B, C and none
  in turn, which is the fastest way to raise one task above another.
- `markdown-org.setPriority` -- **Set Priority** asks for the value, and takes
  a number as readily as a letter.

The agenda colours a task by its priority and sorts by it inside a day.

## Moving a heading out of the way

Two commands move a whole heading, with everything under it, to another file:

- `markdown-org.moveToArchive` -- **Move to Archive** appends it to
  `<file>.archive.md` beside the file it came from. Closed tasks a file no
  longer needs stay readable without weighing the file down.
- `markdown-org.promoteToMaintain` -- **Promote to Maintain** moves it into the
  file `markdown-org.maintainFilePath` names. A task that turned out to be an
  ongoing duty belongs there rather than in the notes of the day it appeared
  on.

## Tags over the files

A tag is a filter over file names, not a mark inside a file.
`markdown-org.fileTags` declares them, and every notes directory may declare
its own beside them. `ALL` matches everything, `WORK` matches the files whose
path holds `work`, and `!work` matches the files whose path does not.

- `markdown-org.cycleTag` -- **Cycle Tag Filter** steps through the tags in the
  agenda.
- `markdown-org.showTagDictionary` -- **Show File Tags** lists what the tags
  are and which files they cover.
- `markdown-org.currentTag` holds the tag in force; a workspace remembers its
  own.
