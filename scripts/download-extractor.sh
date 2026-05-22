#!/usr/bin/env bash
# Download a prebuilt markdown-org-extract binary from its GitHub Releases
# and place it under `bin/` so `vsce package` ships it inside the VSIX.
#
# Usage: scripts/download-extractor.sh <vscode-target>
#
# vscode-target is the value passed to `vsce package --target`:
#   linux-x64, darwin-x64, darwin-arm64, win32-x64
#
# The extractor version is read from package.json
# (`x-markdown-org.extractorVersion`) so the binary version is bumped in
# one place when upgrading the extractor.
#
# Idempotent: if `bin/<binary>` is already present and its sha256 matches
# the upstream `.sha256`, the script returns without re-downloading.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <vscode-target>" >&2
  echo "       vscode-target: linux-x64 | darwin-x64 | darwin-arm64 | win32-x64" >&2
  exit 2
fi

vscode_target=$1

# VS Code platform → Rust target triple. The right-hand side has to match
# the asset names produced by markdown-org-extract's release.yml.
case "$vscode_target" in
  linux-x64)    rust_target=x86_64-unknown-linux-gnu;   archive_ext=tar.gz; binary=markdown-org-extract     ;;
  darwin-x64)   rust_target=x86_64-apple-darwin;        archive_ext=tar.gz; binary=markdown-org-extract     ;;
  darwin-arm64) rust_target=aarch64-apple-darwin;       archive_ext=tar.gz; binary=markdown-org-extract     ;;
  win32-x64)    rust_target=x86_64-pc-windows-msvc;     archive_ext=zip;    binary=markdown-org-extract.exe ;;
  *)
    echo "error: unsupported vscode-target '$vscode_target'" >&2
    echo "       expected one of: linux-x64, darwin-x64, darwin-arm64, win32-x64" >&2
    exit 2
    ;;
esac

repo_root=$(cd "$(dirname "$0")/.." && pwd)
extractor_version=$(node -p "require('$repo_root/package.json')['x-markdown-org'].extractorVersion")
if [ -z "$extractor_version" ] || [ "$extractor_version" = "undefined" ]; then
  echo "error: x-markdown-org.extractorVersion missing from package.json" >&2
  exit 1
fi

stem="markdown-org-extract-${extractor_version}-${rust_target}"
asset="${stem}.${archive_ext}"
url_base="https://github.com/VitalyOstanin/markdown-org-extract/releases/download/v${extractor_version}"
archive_url="${url_base}/${asset}"
sha_url="${url_base}/${asset}.sha256"

bin_dir="${repo_root}/bin"
mkdir -p "$bin_dir"
final_binary="${bin_dir}/${binary}"

# sha256 verification helper: macOS ships `shasum`, Linux/Git-Bash ship
# `sha256sum`. Both accept the `<hash>  <filename>` line format the upstream
# `.sha256` file uses.
sha_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$@"
  else
    echo "error: neither sha256sum nor shasum is available" >&2
    exit 1
  fi
}

# Pure stdin sha256 helper (no filename in output). Used to check whether
# the already-extracted binary on disk matches the upstream archive's
# embedded binary -- which it doesn't, the .sha256 is of the archive,
# not of the binary. So instead we compare the cached archive's hash.
sha_of_file() {
  sha_cmd "$1" | awk '{print $1}'
}

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

archive_path="${tmp_dir}/${asset}"
sha_path="${archive_path}.sha256"

echo "Downloading ${asset} from ${archive_url}"
curl --fail --silent --show-error --location --retry 3 --retry-delay 2 \
  --output "$archive_path" "$archive_url"
curl --fail --silent --show-error --location --retry 3 --retry-delay 2 \
  --output "$sha_path" "$sha_url"

# Verify sha256 of the downloaded archive against the upstream .sha256 file.
# `sha_cmd -c` (`sha256sum -c` / `shasum -a 256 -c`) expects the checksum
# file to reference the asset by its plain basename; both upstream releases
# produce exactly that.
cd "$tmp_dir"
sha_cmd -c "${asset}.sha256"
cd - >/dev/null

# Idempotency: if the previously-extracted binary's hash matches the new
# archive's binary hash, skip the unpacking. We hash the binary inside the
# archive without writing it out twice.
case "$archive_ext" in
  tar.gz)
    inner_hash=$(tar -xOzf "$archive_path" "${stem}/${binary}" | sha_cmd | awk '{print $1}')
    ;;
  zip)
    # `unzip -p` streams a file's bytes to stdout; pair with sha_cmd
    # reading stdin (no -- needed, both sha256sum and shasum accept stdin
    # when called with no file args).
    inner_hash=$(unzip -p "$archive_path" "${stem}/${binary}" | sha_cmd | awk '{print $1}')
    ;;
esac

if [ -f "$final_binary" ]; then
  existing_hash=$(sha_of_file "$final_binary")
  if [ "$existing_hash" = "$inner_hash" ]; then
    echo "bin/${binary} already up to date (sha256: ${inner_hash})"
    exit 0
  fi
fi

# Extract just the binary -- README.md and LICENSE in the archive are not
# bundled in the VSIX, the extension already has its own.
case "$archive_ext" in
  tar.gz)
    tar -xzf "$archive_path" -C "$tmp_dir" "${stem}/${binary}"
    ;;
  zip)
    unzip -q "$archive_path" "${stem}/${binary}" -d "$tmp_dir"
    ;;
esac

mv "${tmp_dir}/${stem}/${binary}" "$final_binary"
# tar preserves the +x bit from the source filesystem (Linux runner builds
# the binary with executable mode), but be defensive in case the archive
# was repacked. No-op on Windows where zip does not carry POSIX modes.
chmod +x "$final_binary" 2>/dev/null || true

echo "Installed ${binary} → ${final_binary}"
