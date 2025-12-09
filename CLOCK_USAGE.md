# CLOCK Usage Examples

## Basic Usage

### Starting a CLOCK Entry

1. Place cursor on or under a heading
2. Press `Ctrl+K Ctrl+K Ctrl+C Ctrl+S`
3. An open CLOCK entry is created:

```markdown
## TODO Working on feature
`CREATED: <2025-12-09 Tue 10:00>`
`CLOCK: [2025-12-09 Tue 14:30]`
```

### Finishing a CLOCK Entry

1. Place cursor on or under the same heading
2. Press `Ctrl+K Ctrl+K Ctrl+C Ctrl+F`
3. The CLOCK entry is closed with duration:

```markdown
## TODO Working on feature
`CREATED: <2025-12-09 Tue 10:00>`
`CLOCK: [2025-12-09 Tue 14:30]--[2025-12-09 Tue 16:45] =>  2:15`
```

## Time Rounding

### Without Rounding (Default)

CLOCK entries use exact current time:

```json
{
  "markdown-org.clockRoundMinutes": undefined
}
```

Result:
```markdown
`CLOCK: [2025-12-09 Tue 14:37]--[2025-12-09 Tue 16:42] =>  2:05`
```

### With 15-Minute Rounding

```json
{
  "markdown-org.clockRoundMinutes": 15
}
```

Examples:
- Start at 14:37 → rounds to 14:30
- Start at 14:46 → rounds to 14:45
- Finish at 16:42 → rounds to 16:45 (ensures non-zero duration)

Result:
```markdown
`CLOCK: [2025-12-09 Tue 14:30]--[2025-12-09 Tue 16:45] =>  2:15`
```

### With 30-Minute Rounding

```json
{
  "markdown-org.clockRoundMinutes": 30
}
```

Examples:
- Start at 14:10 → rounds to 14:00
- Start at 14:39 → rounds to 14:30
- Finish at 16:46 → rounds to 17:00 (if start was 16:30)

Result:
```markdown
`CLOCK: [2025-12-09 Tue 14:30]--[2025-12-09 Tue 17:00] =>  2:30`
```

## Multiple CLOCK Entries

You can have multiple CLOCK entries per task. They are automatically sorted by time (newest at bottom):

```markdown
## TODO Code review
`CREATED: <2025-12-09 Tue 09:00>`
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] =>  1:30`
`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 16:00] =>  2:00`
`CLOCK: [2025-12-09 Tue 16:30]`
```

## Placement Rules

CLOCK entries are placed:
1. After all timestamp lines (`CREATED`, `SCHEDULED`, `DEADLINE`, `CLOSED`)
2. Before any content
3. Grouped together

Example:
```markdown
## TODO Important task
`CREATED: <2025-12-09 Tue 09:00>`
`SCHEDULED: <2025-12-10 Wed 10:00>`
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:00] =>  1:00`
`CLOCK: [2025-12-09 Tue 14:00]`

Task description and notes go here.
```

## Error Handling

### Cannot Start When Open CLOCK Exists

If you try to start a new CLOCK when one is already open:
- Warning message: "There is already an open CLOCK entry"
- No new CLOCK is created
- Close the existing CLOCK first

### Cannot Finish Without Open CLOCK

If you try to finish when no open CLOCK exists:
- Warning message: "No open CLOCK entry found"
- Start a CLOCK first

## Duration Calculation

Duration is automatically calculated and formatted as `HH:MM`:

Examples:
- 1 hour 30 minutes → `1:30`
- 30 minutes → `0:30`
- 2 hours → `2:00`
- 10 hours 15 minutes → `10:15`

## Integration with Org-Mode

The CLOCK format is compatible with Emacs Org-mode:

```org
* TODO Task
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] =>  1:30
```

This allows you to:
- Share files between VS Code and Emacs
- Use org-mode's time reporting features
- Maintain consistent time tracking across editors
