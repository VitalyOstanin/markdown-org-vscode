# ADR-0019: Notifications of panel actions follow the agenda UI language; the rest of the extension stays English

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Amends [ADR-0013](0013-agenda-ui-language-own-dictionary.md), which
drew the boundary at the panel's own markup; the language axis and the
dictionary mechanism it decided are unchanged.

## Context

ADR-0013 scoped `markdown-org.uiLanguage` to what the agenda panel renders and
said that notifications raised through VS Code -- error toasts, warnings,
status-bar messages -- stay in English. That held while the panel only drew
things.

The panel has since grown buttons that act: the group menu on an overdue band
(move to today, drop the planning line, mark cancelled) and the git chip's
Commit and Push. Their outcome cannot be shown inside the panel. A commit needs a
message, which is `showInputBox`; creating an upstream needs consent, which is a
modal; a rejected push has to say which branch is behind which upstream; and
"Committed 3 files" is a status-bar line by nature -- it is over before the panel
redraws. So every one of these surfaces is a host notification, and each of them
was written in the language of the button that raised it, because a Russian panel
answering a Russian button in English reads as a failure of the panel rather than
a documented seam.

The result contradicts the letter of ADR-0013: six such strings now come from
`agendaI18n.ts`, one per category the earlier decision named as staying English.
The counts inside them follow the same rule the panel's counts do -- the plural
form from the interface language, the digits from `markdown-org.dateLocale`
(`countedNoun`) -- because the button and its answer are one action and printing
"Commit ٣" then "Committed 3 files" says otherwise.

## Decision

The boundary is the action, not the surface:

- A notification raised by an action **started from the agenda panel** is written
  in `markdown-org.uiLanguage`, whatever VS Code API shows it. That is the group
  actions, their undo, and the git commit and push, including their prompts,
  refusals and progress titles.
- Everything else the extension says stays English: notifications of the editor
  commands, diagnostics of the extractor and of the panel itself
  (`Agenda refresh failed: …`), command titles in the Command Palette, and the
  setting titles and descriptions. These come from the manifest or from code with
  no panel behind it.
- Numbers in those notifications go through `countedNoun`, so a message carries
  the digits of the date locale, as the panel does.
- `package.nls.*` and `vscode.l10n` remain unadopted, for the reason ADR-0013
  gives: they follow the editor display language, which is the wrong axis.

## Consequences

- The rule is answerable from where the string is raised: a message about an
  action of the panel goes into `agendaI18n.ts`, anything else is written in
  place, in English.
- The seam is now inside the notification list: a commit from the panel answers
  in Russian while a failed archive command answers in English. That is
  deliberate -- the alternative is an English answer to a Russian button, which
  the user attributes to the panel being half-translated.
- Adding an action to the panel means adding its strings to both dictionaries,
  which the existing pair of generic tests already enforces.
- Should the extension ever localise its editor commands, this decision does not
  block it; the boundary would simply move out.

## References

- Dictionary and the language axis: [ADR-0013](0013-agenda-ui-language-own-dictionary.md)
- Strings of the panel's actions: `src/utils/agendaI18n.ts` (`git`, `group`)
- Where they are raised: `src/commands/gitActions.ts`, `src/commands/groupActions.ts`
- Counted nouns with the locale's digits: `src/utils/countedNoun.ts`
- User-facing description: [README.md > `markdown-org.uiLanguage`](../../README.md#markdown-orguilanguage)
