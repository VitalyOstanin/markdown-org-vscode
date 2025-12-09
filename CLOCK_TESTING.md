# CLOCK Testing Guide

## Manual Testing Steps

### 1. Basic CLOCK Start/Finish

1. Open a markdown file in VS Code
2. Create a heading:
   ```markdown
   ## TODO Test task
   ```
3. Place cursor on the heading
4. Press `Ctrl+K Ctrl+K Ctrl+C Ctrl+S` to start CLOCK
5. Verify open CLOCK entry appears:
   ```markdown
   ## TODO Test task
   CLOCK: [2025-12-09 Tue 17:30]`
   ```
6. Wait a few seconds
7. Press `Ctrl+K Ctrl+K Ctrl+C Ctrl+F` to finish CLOCK
8. Verify closed CLOCK with duration:
   ```markdown
   ## TODO Test task
   CLOCK: [2025-12-09 Tue 17:30]--[2025-12-09 Tue 17:31] =>  0:01
   ```

### 2. Test Time Rounding

1. Open VS Code settings (`Ctrl+,`)
2. Search for "markdown-org.clockRoundMinutes"
3. Set value to `30`
4. Create a new heading and start CLOCK
5. Verify time is rounded to :00 or :30
6. Finish CLOCK
7. Verify finish time is rounded up and duration is non-zero

### 3. Test Multiple CLOCK Entries

1. Create a heading with CREATED timestamp:
   ```markdown
   ## TODO Multi-clock task
   `CREATED: <2025-12-09 Tue 10:00>`
   ```
2. Start and finish first CLOCK
3. Start and finish second CLOCK
4. Verify both entries exist and are sorted by time

### 4. Test Error Handling

**Test: Cannot start when open CLOCK exists**
1. Start a CLOCK entry
2. Try to start another CLOCK (without finishing first)
3. Verify warning message appears
4. Verify no duplicate CLOCK is created

**Test: Cannot finish without open CLOCK**
1. Create a heading without CLOCK
2. Try to finish CLOCK
3. Verify warning message appears

### 5. Test CLOCK Placement

1. Create a heading with multiple timestamps:
   ```markdown
   ## TODO Placement test
   `CREATED: <2025-12-09 Tue 10:00>`
   `SCHEDULED: <2025-12-10 Wed 14:00>`
   ```
2. Start CLOCK
3. Verify CLOCK appears after all timestamp lines

## Automated Testing

Run integration tests:

```bash
cd ~/devel/markdown-org-vscode
npm run test:integration
```

Expected output:
```
CLOCK Integration Tests
  ✔ Insert CLOCK start without rounding
  ✔ Insert CLOCK start with 30 minute rounding
  ✔ Insert CLOCK finish closes open CLOCK
  ✔ Insert CLOCK finish with rounding avoids zero duration
  ✔ Cannot insert CLOCK start when open CLOCK exists
  ✔ CLOCK entries are sorted by time
  ✔ CLOCK entries placed after timestamps
  ✔ Multiple CLOCK entries can exist

8 passing
```

## Test Scenarios

### Scenario 1: Daily Time Tracking

```markdown
## TODO Write documentation
`CREATED: <2025-12-09 Tue 09:00>`
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] =>  1:30
`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 16:00] =>  2:00
`CLOCK: [2025-12-09 Tue 16:30]--[2025-12-09 Tue 17:00] =>  0:30

Total: 4 hours
```

### Scenario 2: With Time Rounding (30 min)

```markdown
## TODO Code review
`CREATED: <2025-12-09 Tue 09:00>`
`CLOCK: [2025-12-09 Tue 10:00]--[2025-12-09 Tue 11:30] =>  1:30
`CLOCK: [2025-12-09 Tue 14:00]--[2025-12-09 Tue 16:30] =>  2:30

Total: 4 hours (rounded)
```

### Scenario 3: Open CLOCK (Work in Progress)

```markdown
## TODO Current task
`CREATED: <2025-12-09 Tue 16:00>`
`CLOCK: [2025-12-09 Tue 16:30]`

Currently working...
```

## Verification Checklist

- [ ] CLOCK start creates open entry
- [ ] CLOCK finish closes entry with duration
- [ ] Time rounding works for start time (rounds down)
- [ ] Time rounding works for finish time (rounds up)
- [ ] Duration is never zero when rounding
- [ ] Cannot create multiple open CLOCKs
- [ ] Warning shown when trying to start with open CLOCK
- [ ] Warning shown when trying to finish without open CLOCK
- [ ] CLOCK entries placed after timestamps
- [ ] Multiple CLOCK entries are sorted by time
- [ ] Format compatible with org-mode
- [ ] Works with Russian weekday names
- [ ] Works with English weekday names
- [ ] Indentation matches timestamp lines

## Performance Testing

Test with large files:

1. Create file with 100+ headings
2. Add CLOCK entries to multiple headings
3. Verify commands respond quickly (<100ms)
4. Verify no memory leaks

## Compatibility Testing

Test with Emacs Org-mode:

1. Create CLOCK entries in VS Code
2. Open file in Emacs
3. Verify CLOCK entries are recognized
4. Use org-clock-report
5. Verify time calculations match
