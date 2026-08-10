# Tag Filtering

## Table of Contents

- [Overview](#overview)
- [Where tags are declared](#where-tags-are-declared)
    - [Settings](#settings)
    - [A file beside the notes](#a-file-beside-the-notes)
    - [How the declarations merge](#how-the-declarations-merge)
- [Usage](#usage)
    - [Cycle Tag Filter](#cycle-tag-filter)
    - [Show File Tags](#show-file-tags)
- [Examples](#examples)
    - [Default configuration](#default-configuration)
    - [Several tags at once](#several-tags-at-once)
    - [Taking most of something and refusing part of it](#taking-most-of-something-and-refusing-part-of-it)
- [Pattern matching rules — summary](#pattern-matching-rules--summary)

## Overview

One person is one pool of work. The notes may sit anywhere — a work
repository, a home one, a project of its own — but whoever does them plans in
a single list, so the agenda gathers the tasks from everywhere and shows them
together. Tags are how that single list is narrowed for a while.

Two levels, in this order:

1. **Which directories are read** — `markdown-org.workspaceDirs`. While
   several are read, the chips under the agenda header turn one of them off
   and on for as long as the panel is open, without a rescan.
2. **Which notes of what was read are shown** — the tags described here.

A tag matches the filename **basename**, case-sensitively, as a substring:
`path.basename(task.file)`, never the full path. A pattern like `"work"` will
not match a file inside `/home/me/networking/...` just because the directory
contains "work" — and, for the same reason, a tag cannot name a directory.
That is what the first level is for.

Substring means exactly that, with no word boundaries: `"work"` takes
`work-plan.md` and `homework-2026.md` alike. Where that is too much, refuse
the part you did not mean — see
[Taking most of something and refusing part of it](#taking-most-of-something-and-refusing-part-of-it).

## Where tags are declared

### Settings

**`markdown-org.fileTags`** — a list of tag definitions:

```json
{
    "markdown-org.fileTags": [
        { "name": "ALL", "pattern": "" },
        { "name": "WORK", "pattern": "work" },
        { "name": "PRIVATE", "pattern": "!work" }
    ]
}
```

- `name` — what the tag is called in the UI. The name has no meaning to the
  filter; the "show everything" tag can be called `ALL`, `*`, or anything else.
- `pattern` — one string, the original spelling:
    - `""` (empty) — filtering off, **every** task is shown.
    - `"text"` — basename contains `"text"`.
    - `"!..."` — the tag takes every note no other tag took. The text after
      `!` is only a marker; its content is ignored.
- `include` — a list of substrings; a note matching any of them is in the tag.
- `exclude` — a list of substrings keeping notes out, whatever `include` says.

`pattern` and the two lists can be used together in one entry.

**`markdown-org.currentTag`** — name of the currently active tag (default:
`"ALL"`). Stored at workspace scope when a workspace is open, otherwise global.

### A file beside the notes

A notes directory can carry its tags itself, in `.markdown-org/tags.json`:

```json
[
    { "name": "ALL", "pattern": "" },
    { "name": "WORK", "include": ["work", "job"], "exclude": ["archive"] },
    { "name": "OTHER", "pattern": "!" }
]
```

The file holds exactly what the setting holds, so a configuration is moved by
copying the value across. It lives in the git checkout the notes are synced
through, which is what carries the tags to the other clients of the ecosystem
rather than leaving them in one editor's settings.

A directory with no such file declares nothing, which is the normal state. A
file that will not parse is skipped with a line in the log channel, and the
other directories still describe the agenda.

### How the declarations merge

Everything declared — every directory's file and the settings — merges into
one dictionary:

| Rule                                                                   | Why                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A tag holds every pattern anybody declared for that name               | a tag means the same wherever a note came from                            |
| Including patterns are alternatives; a note matching any of them is in | what one directory calls WORK is WORK for the whole agenda                |
| An exclusion holds against every inclusion                             | otherwise a directory that never heard of it would undo it                |
| A directory that never named a tag is filtered by it like any other    | the alternative makes the same name select different notes on two screens |
| The order of the directories changes nothing                           | a list reordered in the settings must not change what a filter shows      |

`Show File Tags` prints the result with the directory that declared each
pattern.

## Usage

### Cycle Tag Filter

**Command:** `Markdown Org: Cycle Tag Filter`
**Hotkey:** `Ctrl+K Ctrl+K Ctrl+T`

Cycles through the tags of the dictionary in the order they were declared. The
current tag is shown in the agenda navigation bar, and clicking it cycles too.

If `currentTag` names a tag the dictionary does not hold (after an edit, say),
the filter is treated as off and every task is shown.

### Show File Tags

**Command:** `Markdown Org: Show File Tags`

Opens the merged dictionary as a Markdown document: every tag, every pattern
under it, what the pattern does, and which directory — or the settings —
declared it. This is the answer to "why does this tag show that".

## Examples

### Default configuration

```json
[
    { "name": "ALL", "pattern": "" },
    { "name": "WORK", "pattern": "work" },
    { "name": "PRIVATE", "pattern": "!work" }
]
```

- **ALL** — shows everything (the pattern is empty).
- **WORK** — shows tasks whose filename contains `work`.
- **PRIVATE** — shows tasks no other tag took. With this configuration that is
  everything outside WORK, since WORK is the only tag that takes anything.

### Several tags at once

```json
[
    { "name": "ALL", "pattern": "" },
    { "name": "WORK", "pattern": "work" },
    { "name": "PROJECT", "pattern": "project" },
    { "name": "OTHER", "pattern": "!" }
]
```

- **WORK** — basename contains `work`.
- **PROJECT** — basename contains `project`.
- **OTHER** — basename contains **neither** `work` **nor** `project`. The
  marker `"!"` could equally be `"!whatever"`; only the leading `!` matters.

### Taking most of something and refusing part of it

```json
[
    { "name": "WORK", "include": ["work"], "exclude": ["archive"] },
    { "name": "OTHER", "pattern": "!" }
]
```

- **WORK** — `work-plan.md` yes, `work-archive.md` no.
- **OTHER** — takes `work-archive.md`, because WORK refused it and no other
  tag claimed it. A refused note is not lost: it belongs to no tag, and that
  is what OTHER is.

## Pattern matching rules — summary

| Pattern       | Meaning                                              |
| ------------- | ---------------------------------------------------- |
| `""`          | filtering off; show every task                       |
| `"text"`      | `basename(file).includes("text")`                    |
| `"!..."`      | the tag takes every note no other tag took           |
| `include: []` | alternatives; a note matching any of them is in      |
| `exclude: []` | keeps notes out, whatever the including patterns say |

Notes:

- Matching is **substring**, not glob and not regex, and case-sensitive.
- A tag taking every note (an empty pattern) does not count as taking anything
  when the rest is worked out — otherwise `ALL` would leave `!` with nothing.
- All `!`-tags behave the same way; the text after `!` is ignored.
- Filter state is persisted per workspace when possible, so different projects
  can have different active tags.
