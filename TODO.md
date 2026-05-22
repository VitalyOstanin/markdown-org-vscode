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
    - Added `"publisher": "vitalyostanin"` (reused as the Open VSX namespace).
- [x] Pick a distribution channel
    - Open VSX (`vitalyostanin.markdown-org-vscode`) + GitHub Releases (per-target VSIX). Microsoft Marketplace is out of scope -- see [ADR-0004](docs/adr/0004-open-vsx-distribution.md).
- [ ] Generate an SBOM (CycloneDX or SPDX) and attach it to GitHub Releases
    - Currently low-value: the VSIX bundles minimal production deps and the user base is individual.
    - Becomes worth doing once production-deps surface grows or corporate adoption picks up (CRA/EO 14028 readiness, Dependency-Track / Trivy ingestion).
    - Implementation sketch: add a step to `.github/workflows/release.yml` that runs `npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json` after the VSIX is built and attaches `sbom.cdx.json` to the GitHub Release alongside the `.vsix`.

## Documentation

- [x] Improve README.md
    - Added Features section with Org mode link
    - Added Quick Start section
    - Added comprehensive syntax examples (tasks, priorities, timestamps, repeaters)
    - Documented all commands with hotkeys in tables
    - Added detailed Settings section with examples
    - Documented markdown-org-extract dependency and installation
- [ ] Add screenshots/GIF demonstrations
- [x] Add Open VSX version badge to README
    - Shipped in 0.6.0 alongside the auto-publish workflow ([ADR-0004](docs/adr/0004-open-vsx-distribution.md)).
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
