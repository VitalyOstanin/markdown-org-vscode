# ADR-0012: The agenda webview client is a typed TypeScript project, injected by `toString()`

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted.

## Context

The agenda panel (ADR-0002) renders through a webview, and the code that runs
inside that page has to reach it as source text. Until now that text was a
template literal inside `AgendaPanel.getHtmlContent`: roughly 780 lines of
JavaScript living in a string, which made the enclosing function about 890 lines
long.

Nothing checked that string. It was invisible to `tsc` (no types, no arity
checks, no unreachable-code diagnostics), to ESLint, and to Prettier, so a typo
in it survived every gate the repository has and failed only in the page, where
the only symptom is an agenda that does not render. The pure helpers the client
calls were already extracted into `src/utils/` and unit-tested, and their sources
were inlined next to the client with `Function.prototype.toString()` -- but the
client that called them was not covered by anything except the integration
suite's end-to-end assertions.

Two constraints shape the solution:

- **No bundler.** The extension ships compiled `out/` with no build step beyond
  `tsc`; introducing esbuild/webpack for one file is a disproportionate amount of
  new machinery to maintain and audit.
- **The DOM lib must not leak into the host.** The extension host runs in Node.
  Adding `"DOM"` to the single `tsconfig.json` would make `document` and `window`
  type-check in host code (where they do not exist at runtime), and mixing the
  DOM and `@types/node` timer declarations changes what `setTimeout` returns.

## Decision

The client lives in `src/webview/agendaClient.ts` as a single exported function,
`agendaClientMain(boot, deps)`, compiled by its own project
(`tsconfig.webview.json`, `lib: ["ES2022", "DOM"]`, `composite: true`) and
referenced from the host `tsconfig.json`. `npm run compile` is `tsc -b`, which
builds the referenced project first; the host then resolves
`../webview/agendaClient` through the emitted declaration file instead of
compiling the source a second time.

Injection stays `toString()`-based: `getHtmlContent` emits the inlined helper
sources, then `(agendaClientMain.toString())(bootstrap, { ...helpers })`.
Consequently the client may not `import` anything at runtime -- a stringified
body carries no module bindings -- so every dependency arrives as a parameter.
Type-only imports are fine; they are erased before stringification.

The helper contract is `AgendaClientDeps`, declared in the client. The host holds
the real functions in `AgendaPanel.INLINED_HELPERS`, an object literal with
`satisfies AgendaClientDeps`, and derives both the emitted sources
(`Object.values(...).map(fn => fn.toString())`) and the argument list
(`Object.keys(...)`) from it. The shorthand spelling of that literal is what
makes the two agree: the key is the function's own name, so the name in the
argument list matches the `function <name>(...)` declaration emitted above it.

The payload contract (`src/types.ts`) and the UI dictionary
(`src/utils/agendaI18n.ts`) are part of the webview project, because a file
belongs to exactly one project and the client needs their types; the host reads
them back through the emitted declarations.

## Consequences

- The webview client is type-checked, linted and formatted like the rest of the
  repository. `getHtmlContent` is the HTML shell only (~35 lines).
- A helper whose signature changes now breaks the build at
  `INLINED_HELPERS`, instead of breaking the page at load time.
- The types the client needs from `src/utils/` (click resolution, day/tasks card
  models, tooltips) are restated structurally in `agendaClient.ts` rather than
  imported, since those modules stay in the host project. The `satisfies` check
  is what keeps the restatement honest.
- Renaming a helper on import (`import { escapeHtml as esc }`) would emit a name
  in the argument list that no declaration provides. An integration test derives
  the list from the generated HTML and asserts a matching declaration for each
  name, so that mistake fails the suite rather than the page.
- Two `.tsbuildinfo` files now live under `out/` (git-ignored, excluded from the
  VSIX). `tsc -b` is incremental: a stale build is fixed with `rm -rf out`.
- Contributors get one more config file to know about; `DEVELOPMENT.md` describes
  which project owns what.

## References

- [ADR-0002](0002-webview-agenda.md) -- the webview-based agenda this client renders.
- `src/webview/agendaClient.ts`, `tsconfig.webview.json`, `src/views/agendaPanel.ts`.
- Pre-release review of 2026-07-25, finding "getHtmlContent is ~890 lines, ~780 of
  them JavaScript outside every checker".
