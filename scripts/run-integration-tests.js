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

function main() {
    const xvfbRun = findXvfbRun();
    const nodeBin = process.execPath;
    const forwarded = process.argv.slice(2);
    let command;
    let args;

    if (xvfbRun) {
        command = xvfbRun;
        args = ['-a', '--server-args=-screen 0 1280x720x24', nodeBin, VSCODE_TEST_BIN, ...forwarded];
    } else {
        if (process.platform === 'linux') {
            console.warn(
                '[run-integration-tests] xvfb-run not found in PATH; running the test ' +
                    'VS Code on the current $DISPLAY. Install xvfb (e.g. `apt install xvfb`) ' +
                    'to keep tests off your real display.'
            );
        }
        command = nodeBin;
        args = [VSCODE_TEST_BIN, ...forwarded];
    }

    const child = spawn(command, args, { stdio: 'inherit' });
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
