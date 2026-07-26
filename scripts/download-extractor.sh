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
#
# Alongside the binary it installs the extractor's own LICENSE and the
# third-party notices its archive carries (extractor 0.11.1 and later):
#   bin/LICENSE.markdown-org-extract
#   bin/THIRD-PARTY-LICENSES.markdown-org-extract.txt

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

# Then against the hash pinned in this repository. The upstream .sha256 sits
# next to the archive in the same release, so on its own it proves only that
# the transfer was intact: whoever could replace the asset could replace the
# checksum with it. The pin is the independent anchor -- it changes only in a
# commit here, where a reviewer sees it next to the version bump.
pinned_sha=$(node -p "(require('$repo_root/package.json')['x-markdown-org'].extractorSha256 || {})['$rust_target'] || ''")
actual_sha=$(sha_of_file "$archive_path")
if [ -z "$pinned_sha" ]; then
  echo "error: no pinned sha256 for target '$rust_target' in package.json" >&2
  echo "       add x-markdown-org.extractorSha256['$rust_target'] = $actual_sha" >&2
  echo "       (after checking that this is the archive you meant to ship)" >&2
  exit 1
fi
if [ "$pinned_sha" != "$actual_sha" ]; then
  echo "error: ${asset} does not match the sha256 pinned in package.json" >&2
  echo "       pinned:   $pinned_sha" >&2
  echo "       download: $actual_sha" >&2
  echo "       Either the release assets changed, or the pin was not updated with extractorVersion." >&2
  exit 1
fi

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

notice_file="${bin_dir}/THIRD-PARTY-LICENSES.markdown-org-extract.txt"

# The licence notices have to be present too, or a checkout that fetched the
# binary before this script started shipping them would stay without one.
if [ -f "$final_binary" ] && [ -f "${bin_dir}/LICENSE.markdown-org-extract" ] &&
  [ -f "$notice_file" ]; then
  existing_hash=$(sha_of_file "$final_binary")
  if [ "$existing_hash" = "$inner_hash" ]; then
    echo "bin/${binary} already up to date (sha256: ${inner_hash})"
    exit 0
  fi
fi

# Extract the binary, the extractor's own LICENSE, and the notices of the
# crates linked into it. The extension's LICENSE.txt covers the extension;
# markdown-org-extract is a separate work with its own copyright line, and MIT
# asks for that notice to travel with the copies being distributed -- which is
# what the VSIX does with the binary. The binary is statically linked, so the
# same obligation applies to its own dependencies; the extractor generates
# THIRD-PARTY-LICENSES.txt from its dependency graph and ships it in the
# archive (its ADR-0024), which is why this is a download rather than a copy
# kept here: a hand-maintained list would go stale the moment the pin below
# moves. README.md from the archive is not shipped: it duplicates
# documentation the extension already links to.
case "$archive_ext" in
  tar.gz)
    tar -xzf "$archive_path" -C "$tmp_dir" \
      "${stem}/${binary}" "${stem}/LICENSE" "${stem}/THIRD-PARTY-LICENSES.txt"
    ;;
  zip)
    unzip -q "$archive_path" \
      "${stem}/${binary}" "${stem}/LICENSE" "${stem}/THIRD-PARTY-LICENSES.txt" -d "$tmp_dir"
    ;;
esac

mv "${tmp_dir}/${stem}/${binary}" "$final_binary"
mv "${tmp_dir}/${stem}/LICENSE" "${bin_dir}/LICENSE.markdown-org-extract"
mv "${tmp_dir}/${stem}/THIRD-PARTY-LICENSES.txt" "$notice_file"
# tar preserves the +x bit from the source filesystem (Linux runner builds
# the binary with executable mode), but be defensive in case the archive
# was repacked. No-op on Windows where zip does not carry POSIX modes.
chmod +x "$final_binary" 2>/dev/null || true

echo "Installed ${binary} → ${final_binary}"
