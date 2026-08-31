# ADR-0023: A task is written by saying it, and the core is what reads the phrase

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-08-31.

## Context

A task in this format is a heading with a keyword, an optional priority cookie
and a planning line under it carrying a date, an hour and a repeater inside a
timestamp. Written by hand that is a heading typed, a keyword command, a
priority picker, an `Insert SCHEDULED Timestamp`, and then the date, the hour
and the repeater adjusted token by token.

Whoever is adding the task knows all of it in one sentence — "позвонить врачу
завтра в 15:00, каждую неделю" — and extractor 0.20.0 reads exactly such a
sentence: `parse-phrase` prints the fields, refining what earlier phrases left
when several are given, and writes nothing itself (its ADR-0035 and ADR-0036).

The Android client took the same release and put the phrase at the head of its
creation screen, where every field it fills is a control the reader can then
correct (its ADR-0038). This extension has no such screen: it edits the file
that is open, and its commands work on the heading the cursor stands in.

## Decision

`Insert Task from Phrase` asks for the sentence in an input box and writes the
entry into the file that is open.

The box reopens after every phrase, its title carrying the lines that would be
written. That is what stands in for the phone's form: the fields are seen
before they reach the file, and an hour read wrong is corrected by saying "в
16:00" rather than by editing the text afterwards. Enter on an empty box
writes; Escape leaves the file untouched.

Every phrase said so far is handed to `parse-phrase` on each call, not the
fields the previous call answered with. The folding of a phrase into what the
earlier ones left is the extractor's, and a second implementation of it here
would eventually disagree with the one the phone runs about which field a
phrase named.

The entry joins the note the cursor stands in: one level deeper than that
heading, after everything already under it including its own subheadings, and
before the blank line that separates it from the next note. A file with no
heading above the cursor has no note to join, and the entry is written at the
cursor as a top-level heading.

Both grammars are consulted whatever language the editor is set to. A phrase in
a language that was switched off would land in the heading whole, and the cost
of consulting the other one is a rule set that does not fire.

The day the phrases are read against is fixed when the command opens and passed
in with `--current-date`. A chain read against a day that changed halfway
through — over midnight, or with the box left open — would answer "tomorrow"
with two different days.

A phrase that named a date and nothing else is refused: an entry with an empty
heading is a nameless row in the agenda. A phrase that named no date at all is
a heading and nothing else, which is what the Tasks view is for.

## Consequences

- The pinned extractor moves to 0.20.0. A binary configured through
  `markdown-org.extractorPath` that is older has no `parse-phrase` at all, and
  the command reports its refusal every time; the version warning names it.
- The command speaks the language `markdown-org.uiLanguage` resolved to, like
  the priority picker and the git prompts (ADR-0019). The phrase itself is read
  by both grammars regardless.
- The weekday in the timestamp follows `markdown-org.weekdayLocale`, so an
  entry written this way is spelled the way the file's other timestamps are.
- The entry is written into the open document, so the edit is undone with one
  press of Undo and saved when the file is saved. Nothing is written to a file
  that is not open, and a task added "on the go" needs its file opened first.
- Every entry written this way carries `TODO`. A phrase is how work is added;
  a heading that is not work is typed.

## References

- Extractor ADR-0035 and ADR-0036 — the rules and the refining they follow.
- Android ADR-0038 — the same core call behind a screen instead of a box.
- `src/commands/phraseTask.ts` — the command; `src/utils/phraseEntry.ts` — the
  fields and the lines they become; `src/utils/entryPlacement.ts` — where the
  entry lands.
