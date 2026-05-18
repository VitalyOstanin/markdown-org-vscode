# Tag Filtering

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
    - [Settings](#settings)
- [Usage](#usage)
    - [Cycle Tag Filter](#cycle-tag-filter)
- [Examples](#examples)
    - [Default configuration](#default-configuration)
    - [Multi-positive configuration](#multi-positive-configuration)
- [Pattern matching rules — summary](#pattern-matching-rules--summary)

## Overview

Tag filtering organizes and filters tasks in agenda views by matching the
filename **basename** against a configured pattern.

The match is **case-sensitive substring** on `path.basename(task.file)`, not on
the full absolute path. A pattern like `"work"` will not match a file inside
`/home/me/networking/...` just because the directory contains "work" — only the
file name itself is checked.

## Configuration

### Settings

**`markdown-org.fileTags`** — array of tag definitions:

```json
{
    "markdown-org.fileTags": [
        { "name": "ALL", "pattern": "" },
        { "name": "WORK", "pattern": "work" },
        { "name": "PRIVATE", "pattern": "!work" }
    ]
}
```

- `name` — tag name displayed in UI (the name has no special meaning to the
  filter; you can call the "show everything" tag `ALL`, `*`, or anything else).
- `pattern` — controls which task files are kept when this tag is active:
    - `""` (empty) — filter disabled, **all** tasks are shown.
    - `"text"` — basename contains `"text"`.
    - `"!..."` — basename does **not** match any _positive_ pattern from
      `fileTags`. The text after `!` is only a marker that this is a negation
      tag; its content is ignored.

**`markdown-org.currentTag`** — name of the currently active tag (default:
`"ALL"`). Stored at workspace scope when a workspace is open, otherwise global.

## Usage

### Cycle Tag Filter

**Command:** `Markdown Org: Cycle Tag Filter`
**Hotkey:** `Ctrl+K Ctrl+K Ctrl+T`

Cycles through configured tags in the order they appear in `fileTags`. Current
tag is shown in the agenda navigation bar and clicking it also cycles.

If `currentTag` is not present in `fileTags` (e.g., after editing the list),
the filter is treated as disabled and all tasks are shown.

## Examples

### Default configuration

```json
[
    { "name": "ALL", "pattern": "" },
    { "name": "WORK", "pattern": "work" },
    { "name": "PRIVATE", "pattern": "!work" }
]
```

- **ALL** — shows everything (pattern is empty).
- **WORK** — shows tasks whose filename contains `work`.
- **PRIVATE** — shows tasks whose filename does **not** match any positive
  pattern. With this configuration that's everything outside WORK, since WORK
  is the only positive pattern.

### Multi-positive configuration

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
- **OTHER** — basename matches **neither** `work` **nor** `project`. The
  marker `"!"` could equally be `"!whatever"`; only the leading `!` matters.

## Pattern matching rules — summary

| Pattern  | Meaning                                                      |
| -------- | ------------------------------------------------------------ |
| `""`     | filter disabled; show every task                             |
| `"text"` | `basename(file).includes("text")`                            |
| `"!..."` | `basename(file)` does not match any positive pattern in tags |

Notes:

- Matching is **substring**, not glob and not regex.
- Negation pattern is symmetric: with N positive patterns, all `!`-tags behave
  the same way ("none of the positives match"). The text after `!` is ignored.
- Filter state is persisted per workspace when possible, so different projects
  can have different active tags.
