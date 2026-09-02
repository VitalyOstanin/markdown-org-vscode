# ADR-0026: An entry is changed by saying what to change, and a leftover refuses the phrase

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-09-02.

## Context

[ADR-0023](0023-a-task-is-written-by-saying-it.md) has a task written by
saying it: the core reads the sentence, this extension writes the lines.
Changing an entry that already exists went the other way — one command per
field, and each of them short: `Set TODO`, `Set Priority`, `Insert SCHEDULED
Timestamp`, the timestamp adjusters.

One change is one command, which is short enough. Three changes are three
commands and two dialogs of choice, and the sentence that names all three is
one the core can now read in full: 0.21.0 of the extractor answers with a
keyword and with the fields a phrase said to empty, beside the fields it
filled.

What the sentence needs on this side is an entry to aim at, and a rule for the
words the grammar did not consume. For a new entry a leftover is harmless: it
becomes part of the heading, which is a field the person is about to look at
anyway. An edit has no heading to put it in — the entry has one already, and it
is not what the phrase was about.

## Decision

`Edit Task from Phrase` asks for one sentence and applies it to the entry the
cursor stands in.

The entry is the one `findNearestHeading` reports — the deepest heading
containing the cursor — which is what `setTodo`, `setPriority` and the planning
commands already act on. A phrase said with the cursor in a container section
therefore changes that section, exactly as `Insert SCHEDULED Timestamp` does
today.

One phrase, not a chain. The edit is written as soon as it is read, and what
takes it back is the editor's own undo; refining by saying more belongs to the
creation box, where nothing has been written yet.

A phrase the rules did not consume in full changes nothing at all, and the
leftover is named. So is a phrase that named no field, and one that named an
hour or a repeater for an entry with no day to hang it on.

The rules of the change itself live in `src/utils/phraseEdit.ts`, which takes
lines and returns lines. The command is the part that talks to `vscode`.

## Consequences

Three changes are one sentence: "перенеси на пятницу в 16:00 и сделай срочной"
is one box, one write and one undo, where the commands are three invocations
and two pickers. The commands stay — one of them is still the shortest way to
make one change, and none of them needs the extractor to run.

A phrase is refused over a single word the grammar does not know. That is the
cost of not applying half of what was said: "перенеси на пятницу совсем" would
otherwise move the date and quietly drop the rest, and the person would have
to notice that themselves. What is refused is named, so the answer is to say
it again in words the rules know.

The planning line the entry already carries is rewritten rather than replaced:
the hour, the repeater and the weekday spelling stay as the file writes them,
so a note kept in English keeps its English weekdays whatever language the
editor is set to. An entry with no planning line gains one, under the
`CREATED:` mark where there is one — the order both clients write an entry in.

The pinned extractor moves to 0.21.0. An older binary answers without the two
keys this reads, and a phrase that empties a field would then change nothing
while looking as though it worked; the version warning says so.

## References

- [ADR-0023](0023-a-task-is-written-by-saying-it.md) — writing a task by
  saying it, and why the rules live in the core.
- [ADR-0025](0025-the-phrase-box-names-a-muted-microphone.md) — the box a
  phrase is said into.
- ADR-0037 of `markdown-org-extract` — the keyword and the emptied fields this
  reads.
