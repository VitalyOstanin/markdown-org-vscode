#!/usr/bin/env node
'use strict';

// Wrap `vscode-test` (from @vscode/test-cli) with xvfb-run when it's
// available, so running `npm run test:integration` locally never pops the
// test VS Code instance on the developer's real X display. When xvfb-run
// is missing (macOS, Windows, headless containers that don't ship it),
// fall back to running the test host directly.
//
// All command-line arguments passed to this script are forwarded to
// `vscode-test`. The wrapper itself takes no flags.

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

// Resolve the `vscode-test` binary from node_modules without going through
// require.resolve / `exports`: `@vscode/test-cli` does not list
// `out/bin.mjs` or `package.json` in its exports map, so the standard
// resolver refuses both. The path is stable enough to hardcode against
// the local installation tree.
function resolveVscodeTestBin() {
    const fs = require('node:fs');
    const repoRoot = path.join(__dirname, '..');
    const candidate = path.join(repoRoot, 'node_modules', '@vscode', 'test-cli', 'out', 'bin.mjs');
    if (!fs.existsSync(candidate)) {
        throw new Error(`@vscode/test-cli binary not found at ${candidate}; run \`npm install\` first`);
    }
    return candidate;
}

const VSCODE_TEST_BIN = resolveVscodeTestBin();

function findXvfbRun() {
    if (process.platform !== 'linux') {
        return null;
    }
    // `command -v` is the POSIX shell builtin for "is this in PATH?". It is
    // present in every shell we expect to encounter (busybox, dash, bash,
    // zsh) and avoids the assumption that the standalone `which` binary is
    // installed, which is not guaranteed in minimal containers.
    const probe = spawnSync('sh', ['-c', 'command -v xvfb-run'], {
        stdio: ['ignore', 'pipe', 'ignore']
    });
    if (probe.error || probe.status !== 0) {
        return null;
    }
    return 'xvfb-run';
}

// Force the Electron-based test VS Code onto xvfb's virtual X server.
// `xvfb-run` only sets $DISPLAY (X11); it does NOT touch Wayland. On a
// Wayland session Electron auto-selects the Wayland backend from
// XDG_SESSION_TYPE and, even with WAYLAND_DISPLAY unset, falls back to the
// default `wayland-0` socket -- connecting to the real compositor and
// popping a live window on the developer's screen despite xvfb. Pin the
// session type and backend to X11 so the auto-detection picks xvfb's X
// server. The decisive lever is the explicit `--ozone-platform=x11` launch
// arg in `.vscode-test.mjs`; these env vars are belt-and-suspenders.
function xvfbChildEnv() {
    const env = { ...process.env };
    delete env.WAYLAND_DISPLAY;
    env.XDG_SESSION_TYPE = 'x11';
    env.GDK_BACKEND = 'x11';
    env.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
    return env;
}

function main() {
    const xvfbRun = findXvfbRun();
    const nodeBin = process.execPath;
    const forwarded = process.argv.slice(2);
    let command;
    let args;
    let spawnEnv = process.env;

    if (xvfbRun) {
        command = xvfbRun;
        args = ['-a', '--server-args=-screen 0 1280x720x24', nodeBin, VSCODE_TEST_BIN, ...forwarded];
        spawnEnv = xvfbChildEnv();
    } else if (process.platform === 'linux') {
        // No xvfb-run on Linux. Running the test VS Code on the real
        // $DISPLAY pops a live window on the developer's screen mid-run.
        // Refuse to fall back to the real display -- the only exception is
        // CI, where the runner is headless and has no real display to
        // disturb. Locally this is a hard error: install xvfb instead.
        if (process.env.CI) {
            console.warn(
                '[run-integration-tests] xvfb-run not found in PATH; CI detected, ' +
                    'running the test VS Code directly (headless runner).'
            );
            command = nodeBin;
            args = [VSCODE_TEST_BIN, ...forwarded];
        } else {
            console.error(
                '[run-integration-tests] xvfb-run not found in PATH. Refusing to run ' +
                    'the test VS Code on your real $DISPLAY. Install xvfb ' +
                    '(e.g. `apt install xvfb`) and retry. Direct display fallback is ' +
                    'allowed only in CI (set CI=1 to force it).'
            );
            process.exit(1);
        }
    } else {
        // Non-Linux (macOS, Windows): xvfb does not exist on these
        // platforms, so the test host manages its own display.
        command = nodeBin;
        args = [VSCODE_TEST_BIN, ...forwarded];
    }

    const child = spawn(command, args, { stdio: 'inherit', env: spawnEnv });
    child.on('exit', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exit(code ?? 1);
    });
    child.on('error', (err) => {
        console.error(`[run-integration-tests] failed to spawn ${command}: ${err.message}`);
        process.exit(1);
    });
}

main();
