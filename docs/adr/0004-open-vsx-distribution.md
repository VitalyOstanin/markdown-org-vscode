# ADR-0004: Distribute via Open VSX and GitHub Releases, not Microsoft Marketplace

## Table of Contents

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Consequences](#consequences)
- [References](#references)

## Status

Accepted.

## Context

VS Code extensions can be distributed through three independent channels:

1. **Microsoft Visual Studio Marketplace** -- the default registry for VS Code, owned by Microsoft. Reached by every VS Code install out of the box.
2. **Open VSX Registry** -- an Eclipse Foundation registry used by VSCodium, Cursor, Gitpod, Theia, code-server, and other VS Code forks. Not used by official VS Code.
3. **Direct VSIX download** -- a `.vsix` file users install manually via `Install from VSIX...`. Works in any VS Code-compatible editor.

Marketplace publishing requires registering a publisher tied to an Azure DevOps organization, which in turn requires an Azure subscription with a payment card on file. For a project maintained by a single individual without a legal entity, this is a structural barrier rather than a one-time setup cost: Azure billing, tax compliance for Microsoft Partner Agreement, and KYC checks all apply.

Open VSX accepts anonymous namespaces with no financial or legal onboarding; namespace ownership is granted by the Eclipse Foundation through a public GitHub issue.

## Decision

The extension is distributed through:

- **Open VSX** (`vitalyostanin.markdown-org-vscode`), auto-published from `release.yml` on every annotated `v*` tag via `ovsx publish` (one VSIX per target platform).
- **GitHub Releases**, where the same per-target VSIX files are attached for users who install via `Install from VSIX...` (this is the supported path for official VS Code).

The extension is **not** published to the Microsoft Visual Studio Marketplace. The `package.json` field `publisher: vitalyostanin` and `qna: false` are retained because Open VSX reuses the same publisher namespace and supports the same `qna` field semantics.

## Consequences

Easier:

- No Azure subscription, no payment instrument, no Microsoft Partner Agreement. CI publishes with a single Open VSX Personal Access Token stored as `secrets.OVSX_PAT`.
- Same VSIX artifacts feed both Open VSX and GitHub Releases -- one matrix build, two outlets.
- Releasing is irrevocable on neither side: a bad version can be unpublished from Open VSX, and a GitHub Release asset can be replaced.

Harder:

- Official VS Code users do not see the extension in the in-editor search. They must download the VSIX from GitHub Releases and install it manually; updates are also manual (the README documents this path).
- Discoverability inside the VS Code ecosystem proper is reduced. Users searching the VS Code Marketplace will not find this extension.
- If the decision is revisited later, the publisher name `vitalyostanin` is already claimed on the Marketplace by anyone who registers it first; recovering the namespace there would require a separate dispute with Microsoft.

## References

- Publish workflow: `.github/workflows/release.yml` (job `publish`, step `Publish VSIX files to Open VSX`)
- Open VSX namespace: [open-vsx.org/namespace/vitalyostanin](https://open-vsx.org/namespace/vitalyostanin)
- Open VSX namespace ownership grant: [EclipseFdn/open-vsx.org#10493](https://github.com/EclipseFdn/open-vsx.org/issues/10493)
- Open VSX publisher CLI: [ovsx](https://github.com/eclipse/openvsx/tree/master/cli)
- README install paths: [README.md > Installation](../../README.md#installation)
