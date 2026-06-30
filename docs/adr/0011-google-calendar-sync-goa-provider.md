# ADR-0011: Google Calendar sync — GOA token provider (Linux)

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted. Extends ADR-0010 (does not supersede it): adds an alternative token
source for Linux; the OAuth flow of ADR-0010 remains for Windows/macOS and as a
forced option.

## Context

ADR-0010's BYO Desktop OAuth client requires per-user Google Cloud setup, and a
client in "Testing" status issues refresh tokens that expire after 7 days. On
Linux/GNOME the desktop already holds a continuously-refreshed Google account in
GNOME Online Accounts (GOA), whose token carries the `auth/calendar` scope.

## Decision

- **Token source**: a new `AccessTokenProvider` backed by GOA. The token is read
  from `org.gnome.OnlineAccounts.OAuth2Based.GetAccessToken`; `forceRefresh`
  calls `Account.EnsureCredentials` first. GOA owns the OAuth refresh under
  GNOME's verified client, so no per-user client and no expiring test tokens.
- **DBus access**: subprocess `busctl --user --json=short` (parsed as JSON);
  `gdbus call` is a fallback for the scalar `GetAccessToken` when busctl is
  absent. No runtime npm dependency; the VSIX stays free of `node_modules`.
- **Selection**: `markdown-org.gcalSync.authProvider` = `auto` (default) | `goa`
  | `oauth`. `auto` uses GOA on Linux when a Google account exists there, else
  OAuth. `markdown-org.gcalSync.goaAccount` pins the account email; empty
  auto-picks the single account or is chosen via Connect.
- **Reuse**: `calendarClient.ts`, `syncEngine.ts`, `eventMapping.ts`,
  `eventId.ts`, idempotency by event id, and the calendar-selection command are
  unchanged — only the token source differs.
- **Secrets**: under GOA nothing is stored in `SecretStorage`; GOA holds the
  credentials.

## Consequences

Easier: no Google Cloud setup and no expiring test tokens on Linux; the existing
REST pipeline is reused verbatim.

Harder: the GOA path is Linux-only and depends on a session DBus bus and `busctl`
being reachable from the VS Code process (not the case in some remote/Flatpak
setups, where `auto` falls back to OAuth). A GOA Google account must have Calendar
enabled for the token to carry the `auth/calendar` scope.

## References

- Design spec: `docs/superpowers/specs/2026-06-30-google-calendar-sync-goa-provider-design.md` (working artefact, git-ignored).
- Prior decision: [ADR-0010](0010-google-calendar-sync.md).
- Modules: `src/utils/gcal/dbus.ts`, `src/utils/gcal/goa.ts`, `src/utils/gcal/authProvider.ts`, `src/commands/gcalSync.ts`.
