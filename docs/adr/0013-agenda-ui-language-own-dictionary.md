# ADR-0013: The agenda UI language is its own setting with its own dictionary, not `vscode.l10n`

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted

## Context

The agenda panel renders its own chrome: mode buttons, Prev/Today/Next, section
and group titles, summary counts, count-chip tooltips and the per-task tooltips.
All of that text had been hardcoded English, while the dates in the same panel
already followed `markdown-org.dateLocale`.

VS Code offers a localisation mechanism for exactly this: `package.nls.*.json`
for the manifest and `vscode.l10n` for runtime strings. It has one property that
decides the matter here: it follows the **editor display language**, which is a
different axis from the locale the agenda formats its dates with. A user reading
Russian dates in an English-language VS Code -- a common setup, since the editor
is often left in English deliberately -- would keep getting an English agenda
next to Russian dates. The panel would be half-translated by design.

Two further constraints come from how the panel is built. The webview client is
injected as source text (ADR-0012), so the strings have to reach the page as
plain data in the bootstrap literal; `vscode.l10n` is a host-side API and is not
reachable from inside the page. And the plural forms Russian needs (три формы:
1 задача / 2 задачи / 5 задач) have to be selected in the page, next to the
number being rendered.

## Decision

Ship the agenda's own language axis:

- `markdown-org.uiLanguage` (`auto` | `en` | `ru`, default `auto`) selects the
  language of what the agenda panel renders.
- `auto` resolves in three steps: `markdown-org.dateLocale` **when the user set
  it explicitly** (checked through `config.inspect`, so the setting's own
  default does not count), then the VS Code display language, then English.
- The dictionaries live in `src/utils/agendaI18n.ts` as plain data
  (`AGENDA_STRINGS`), keyed by language; `formatString` fills `{0}` placeholders
  and `pluralIndex` picks the plural form. Both are inlined into the page.
- The scope is the panel. Notifications the extension raises through VS Code --
  error toasts, warnings, status-bar messages -- stay in English, and the README
  and the setting description say so.

`package.nls.*` and `vscode.l10n` are not adopted: command titles in the Command
Palette stay English, supplied by the manifest.

## Consequences

- Setting the date locale to `ru-RU` gives a fully Russian panel, and a Russian
  VS Code gives one even with the date locale untouched. Setting `uiLanguage`
  explicitly keeps the two axes apart (Russian dates, English interface).
- The dictionaries are ours to maintain: a new string means editing both
  languages. Two generic tests guard the pair -- the placeholder sets of every
  `en`/`ru` string must match, and every counted noun must list as many forms as
  `pluralIndex` can return for that language -- so a half-added string fails the
  build rather than reaching the panel.
- Adding a third language is a dictionary plus an entry in `UI_LANGUAGES`; it is
  not free, but it is contained.
- The Command Palette and the manifest remain English regardless of the setting,
  which is a visible seam. Adopting `package.nls.*` later would not conflict
  with this decision -- it covers a different surface.

## References

- Dictionaries and resolution: `src/utils/agendaI18n.ts` (`AGENDA_STRINGS`,
  `resolveUiLanguage`, `pluralIndex`, `formatString`)
- Explicit-vs-default setting check: `src/utils/explicitSetting.ts`
- Webview injection contract: [ADR-0012](0012-webview-client-as-a-typed-project.md)
- User-facing description: [README.md > `markdown-org.uiLanguage`](../../README.md#markdown-orguilanguage)
