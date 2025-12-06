# Tag Filtering

## Overview

Tag filtering allows you to organize and filter tasks in agenda views based on filename patterns.

## Configuration

### Settings

**`markdown-org.fileTags`** - Array of tag definitions:
```json
{
  "markdown-org.fileTags": [
    {"name": "ALL", "pattern": ""},
    {"name": "WORK", "pattern": "work"},
    {"name": "PRIVATE", "pattern": "!work"}
  ]
}
```

- `name` - Tag name displayed in UI
- `pattern` - Substring to match in filename
  - `"text"` - matches files containing "text"
  - `"!text"` - matches files NOT containing "text" (negation)
  - `""` - matches files without other non-negated patterns

**`markdown-org.currentTag`** - Currently active tag filter (default: "ALL")

## Usage

### Cycle Tag Filter

**Command:** `Markdown Org: Cycle Tag Filter`  
**Hotkey:** `Ctrl+K Ctrl+K Ctrl+T`

Cycles through configured tags: ALL → WORK → PRIVATE → ALL...

Current tag is displayed in agenda view navigation bar and persists between sessions.

## Examples

### Default Configuration

- **ALL** - Shows all tasks
- **WORK** - Shows tasks from files containing "work"
- **PRIVATE** - Shows tasks from files NOT containing "work"

### Custom Configuration

```json
{
  "markdown-org.fileTags": [
    {"name": "ALL", "pattern": ""},
    {"name": "PROJECT_A", "pattern": "proj-a"},
    {"name": "NOT_PROJECT_A", "pattern": "!proj-a"},
    {"name": "URGENT", "pattern": "urgent"},
    {"name": "OTHER", "pattern": ""}
  ]
}
```

Files:
- `proj-a-tasks.md` → PROJECT_A
- `urgent-meeting.md` → URGENT, NOT_PROJECT_A
- `shopping.md` → NOT_PROJECT_A, OTHER
- All files → ALL

### Pattern Matching Rules

1. `"work"` - file path contains "work"
2. `"!work"` - file path does NOT contain "work"
3. `""` - file path doesn't match any non-negated pattern from other tags

