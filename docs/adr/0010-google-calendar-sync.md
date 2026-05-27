# ADR-0010: Google Calendar sync (push MVP)

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Depends on the `org-properties` block (ADR-0009): the calendar
event id and the org-id `ID` live there.

## Context

Optional, opt-in one-way sync (md -> Google Calendar) of tasks carrying an
active `SCHEDULED`/`DEADLINE` timestamp. Cross-platform (Ubuntu, Windows,
macOS). Reference behaviour: Emacs `org-gcal`. Reverse sync is out of
scope (Phase 2).

## Decision

- **OAuth**: BYO Desktop client (user supplies `client_id`/`client_secret`;
  no publisher verification, no secret in the VSIX). Loopback redirect
  (`127.0.0.1:<random>`) + PKCE (S256). OOB is blocked by Google since
  2023-01-31; custom-scheme redirects need a hosted page (rejected).
- **Tokens**: refresh token and client secret in `vscode.SecretStorage`
  (OS keychain on all three platforms).
- **Dependencies**: none. Manual OAuth via Node `fetch` + `node:crypto`;
  Calendar REST via `fetch`. No bundler; `node_modules` stays out of the
  VSIX.
- **Matching/idempotency**: the event id is derived deterministically from
  the task's org-id `ID` (`ID` without dashes, lowercased -- a valid
  base32hex Calendar event id). `events.insert` with that id is
  idempotent (409 -> update), so re-runs never duplicate. `GCAL_EVENT_ID`
  in `org-properties` is a cache, not the source of truth.
- **Concurrency**: an in-process single-flight mutex (policy `queue`
  default / `cancel`) serialises within a window; a workspace fs-lock
  (`globalStorageUri`, atomic `O_EXCL`, heartbeat + TTL stale detection)
  serialises across windows.
- **Calendar**: configurable by name (find-or-create) or pinned id; a
  "Select Google Calendar" QuickPick command. Update/delete are always
  addressed by our event id, so a shared calendar is safe.
- **Lifecycle**: create/update for syncable tasks; delete when a task
  stops qualifying; on `DONE`, delete by default (`onDone` setting).
  Repeaters push a single event at the base date (MVP). Orphans from
  fully deleted headings are not cleaned in the push MVP.
- **Triggers**: manual "Sync now"; optional debounce-on-save, off by
  default.

## Consequences

Easier: cross-platform with zero runtime deps; no publisher OAuth
verification; duplicates structurally prevented; lean VSIX.

Harder: one-time user setup of a Google Cloud OAuth client; multi-window
concurrent sync relies on an fs-lock with stale detection; reverse sync
and orphan reconciliation are deferred.

## References

- Design spec: `2026-05-27-google-calendar-sync-design.md` (working
  artefact, git-ignored, not in this repo).
- On-disk properties: [ADR-0009](0009-task-properties-org-properties-block.md).
- Modules: `src/utils/gcal/*`, `src/commands/gcalSync.ts`.
- Reference behaviour: Emacs `org-gcal`.
