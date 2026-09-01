# ADR-0025: The phrase box names a muted microphone, and switches nothing on

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted, 2026-09-01.

## Context

ADR-0023 made a task out of a sentence, and the sentence is meant to be said:
the box is opened, the editor's speech extension listens, and what was heard is
read by the extractor. Saying it is the point — typing the same sentence is the
work the command exists to replace.

A muted microphone breaks this silently. The input is muted at the mixer, the
speech extension records from it and hears a stream of zeroes, and every visible
sign says it is listening: the box waits, the indicator moves, nothing arrives.
The same failure was met once on this machine outside the editor, where an ALSA
switch left a stream that opened and delivered silence.

Nothing in the editor reports it. The VS Code API has no microphone state, and
the speech extension exposes none. What the machine does have is a mixer that
answers: `pactl get-source-mute @DEFAULT_SOURCE@` says `Mute: yes` or `Mute: no`
for PulseAudio and PipeWire alike — the two the desktop is built on.

## Decision

Before every phrase box, the mixer is asked whether the default input is muted,
and a muted one is named in the prompt under the box: the ordinary prompt with
the microphone appended to it.

Asked before every box, not once per command. A phrase chain reopens the box
after each sentence, the microphone can be unmuted between two of them, and a
reminder that outlived the state it described would be read as noise.

The extension switches nothing on. Unmuting is a change to the machine's audio,
made from the desktop's own controls, and a button here would make an editor
command a mixer — a reach beyond what writing notes needs. What this promises is
that the silence is explained, not that it is fixed.

The question goes to `pactl` and nothing else. `wpctl` answers the same for
PipeWire but not for PulseAudio, and a second probe would double the cost of a
question asked before every box for one machine in a hundred.

Every failure — no `pactl`, no sound server, an answer in an unknown shape —
reads as "not muted". A reminder shown where nothing is known would stand on
every phrase said on Windows and macOS, where the question cannot be asked at
all, and a reminder that is always there says nothing.

## Consequences

The command runs one short process before each box. It is given a deadline, so
a stalled mixer delays the box rather than holding it.

Where `pactl` is absent, the feature is absent with it, silently: Windows and
macOS see the box they always saw. Naming a platform in the interface would
promise something the extension has no way to deliver there.

A microphone muted inside the speech extension rather than at the mixer is not
seen. The mixer is what the machine's own controls act on, and it is the switch
that produced the silence this addresses.

## References

- [ADR-0023: A task is written by saying it, and the core is what reads the phrase](0023-a-task-is-written-by-saying-it.md)
- [`pactl(1)`](https://www.freedesktop.org/wiki/Software/PulseAudio/) — `get-source-mute`, answered by PulseAudio and PipeWire alike
