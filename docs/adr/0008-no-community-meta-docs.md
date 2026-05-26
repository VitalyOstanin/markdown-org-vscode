# ADR-0008: No community meta-docs until a community exists

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Mirrors `markdown-org-extract` ADR-0005 to keep the two
sibling repositories on the same policy.

## Context

Open-source projects routinely accumulate community-facing
meta-documentation: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
`SECURITY.md`, issue templates under `.github/ISSUE_TEMPLATE/`, a
pull-request template `PULL_REQUEST_TEMPLATE.md`. The genre exists
because real external contributor traffic forces a project to write
down its release process, branching model, and reporting channels.

This project does not yet have that traffic. There is a single author
and an agent collaborator; review and merge happen locally; the release
process lives in [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
and in [`CLAUDE.md`](../../CLAUDE.md), and the human-facing build/test
flow is documented in [`DEVELOPMENT.md`](../../DEVELOPMENT.md).

A `CONTRIBUTING.md` written now would duplicate `DEVELOPMENT.md` and the
release workflow, and would be a third place to keep in sync whenever the
process changes -- the same drift that motivated the sibling project to
remove its own stale `CONTRIBUTING.md`.

## Decision

Community-facing meta-documentation is not created until a real
community exists.

Specifically, the following files are **not** in the repository and are
**not** to be created without an explicit request from the maintainer:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/` and any files under it
- `.github/PULL_REQUEST_TEMPLATE.md`

Project conventions (TDD, code style, release process) live in:

- [`CLAUDE.md`](../../CLAUDE.md) -- per-project agent and human
  contributor rules.
- [`DEVELOPMENT.md`](../../DEVELOPMENT.md) -- build, test, debug, and
  release-from-source instructions.
- [`.github/workflows/`](../../.github/workflows/) -- the canonical
  description of release and CI behaviour.
- This `docs/adr/` directory -- architectural and policy decisions with
  context.

Reviewer tasks of the form "add CONTRIBUTING.md" or "create issue/PR
templates" are closed with a pointer to this ADR.

If a real external contributor community appears later, the
meta-documentation is created from the actual current workflow at that
time, not from a template.

## Consequences

Easier:

- No stale meta-documentation to keep in sync. New project rules land in
  a single discoverable place ([`CLAUDE.md`](../../CLAUDE.md) for rules,
  this directory for decisions, [`DEVELOPMENT.md`](../../DEVELOPMENT.md)
  for the build/test flow).
- The repository surface stays small and on-topic.
- The two sibling repositories (`markdown-org-vscode` and
  `markdown-org-extract`) follow one consistent policy.

Harder:

- A first-time external contributor sees a repository without the signals
  they may be used to (no `CONTRIBUTING.md`, no issue templates). The
  README and `DEVELOPMENT.md` have to compensate by pointing at the
  workflow and at this ADR.
- A future creation of these files is a deliberate task, written against
  the workflow as it stands then.

## References

- Sibling policy: `markdown-org-extract` ADR-0005 "No community meta-docs
  until a community exists"
  ([github.com/VitalyOstanin/markdown-org-extract](https://github.com/VitalyOstanin/markdown-org-extract))
- Project rules: [`CLAUDE.md`](../../CLAUDE.md)
- Build/test/release-from-source: [`DEVELOPMENT.md`](../../DEVELOPMENT.md)
- Release workflow: [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
