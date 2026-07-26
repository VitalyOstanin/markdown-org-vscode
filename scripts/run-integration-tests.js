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
const { x11ChildEnv, resolveVscodeTestBin } = require('./lib/x11-harness');

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
    let spawnEnv = process.env;

    if (xvfbRun) {
        command = xvfbRun;
        args = ['-a', '--server-args=-screen 0 1280x720x24', nodeBin, VSCODE_TEST_BIN, ...forwarded];
        // xvfb-run only sets $DISPLAY; the Wayland hints have to go, or
        // Electron connects to the real compositor anyway. See x11ChildEnv.
        spawnEnv = x11ChildEnv();
    } else if (process.platform === 'linux') {
        // No xvfb-run on Linux: refuse, everywhere. Locally, running the test
        // VS Code on the real $DISPLAY pops a live window mid-run. On a
        // headless runner it does not start at all -- and the failure arrives
        // from inside Electron ("cannot open display"), which hides the actual
        // cause. There used to be a CI fallback here; it only ever traded this
        // clear message for that obscure one. `CI` is also a poor switch: any
        // non-empty value, `CI=0` included, would have taken the branch.
        console.error(
            '[run-integration-tests] xvfb-run not found in PATH. The integration ' +
                'tests need it on Linux -- both to keep the test VS Code off your ' +
                'real display and to have a display at all on a headless machine. ' +
                'Install xvfb (e.g. `apt install xvfb`) and retry.'
        );
        process.exit(1);
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
