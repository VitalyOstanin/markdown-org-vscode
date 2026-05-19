# TODO

## Configuration

- [x] Remove hardcoded path from package.json default settings
    - Changed extractorPath default to `markdown-org-extract` (searches in PATH)
    - Changed maintainFilePath default to empty string (disabled)
    - Added dateLocale setting with `en-US` default
- [x] Add helpful error messages for missing configuration
    - extractorPath: shows error if not found
    - maintainFilePath: shows error if not configured when using Promote to Maintain
- [x] Add validation for extractorPath configuration
    - Check if file exists using fs.existsSync() for absolute paths
    - Check if command exists in PATH using 'which' for relative paths
    - Show clear error message if extractor not found with installation instructions

## Publishing

- [x] Add publisher field to package.json
    - Added `"publisher": "vitalyostanin"`
    - Note: Publisher must be registered at https://marketplace.visualstudio.com/manage before publishing
- [ ] Generate an SBOM (CycloneDX or SPDX) and attach it to GitHub Releases
    - Currently low-value: the VSIX bundles minimal production deps and the user base is individual.
    - Becomes worth doing once production-deps surface grows or corporate adoption picks up (CRA/EO 14028 readiness, Dependency-Track / Trivy ingestion).
    - Implementation sketch: add a step to `.github/workflows/release.yml` that runs `npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json` after the VSIX is built and attaches `sbom.cdx.json` to the GitHub Release alongside the `.vsix`.
- [ ] Decide on automated VS Code Marketplace publishing
    - Current: release workflow only creates a GitHub Release with the VSIX; Marketplace publish is manual.
    - Option A: add a `vsce publish` step to `.github/workflows/release.yml` so each annotated tag goes live on Marketplace. Requires `secrets.VSCE_PAT` (Azure DevOps PAT with Marketplace rights) and acceptance that every published tag is irrevocable.
    - Option B: keep Marketplace publish manual and document the local recipe (`npx vsce publish` with the same PAT) in README.
    - Option C: open-vsx publish (separate registry used by VSCodium and others) -- consider alongside whichever choice above is taken.

## Documentation

- [x] Improve README.md
    - Added Features section with Org mode link
    - Added Quick Start section
    - Added comprehensive syntax examples (tasks, priorities, timestamps, repeaters)
    - Documented all commands with hotkeys in tables
    - Added detailed Settings section with examples
    - Documented markdown-org-extract dependency and installation
- [ ] Add screenshots/GIF demonstrations
- [ ] Add Marketplace version badge to README after publishing
    - Once the extension goes live on the VS Code Marketplace, append
      `[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/vitalyostanin.markdown-org-vscode)](https://marketplace.visualstudio.com/items?itemName=vitalyostanin.markdown-org-vscode)`
      to the badge block at the top of README.md.
    - Optional companion: installs badge `visual-studio-marketplace/i/...` and rating badge `visual-studio-marketplace/r/...`.
    - Blocked until the first successful Marketplace publish (see "Decide on automated VS Code Marketplace publishing" above).
- [x] Create CHANGELOG.md
    - Documented version 0.1.0 features
    - Set up format for future releases

## Testing

- [x] Add unit tests for core functionality
    - Test timestamp parsing and manipulation
    - Test task status changes
    - Test priority toggling
    - Test heading parsing and extraction
- [x] Set up test framework (Mocha)
- [x] Add integration tests for commands
    - Test task status commands (setTodo, setDone, togglePriority)
    - Test timestamp commands (insertCreated, insertScheduled, insertDeadline)
    - Test timestamp navigation (timestampUp, timestampDown)
    - Test command execution in real VS Code environment
