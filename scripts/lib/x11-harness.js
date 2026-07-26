'use strict';

// Shared plumbing for the scripts that run VS Code on a headless X server:
// `record-demo.js` and `screenshot-demo.js` (own Xvfb) and
// `run-integration-tests.js` (xvfb-run). Each of them used to carry its own
// copy of these helpers, so a change to the Wayland/X11 handling had to be made
// three times, under two different names.

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const repoRoot = path.join(__dirname, '..', '..');

/**
 * The child environment with the Wayland hints scrubbed, so Electron picks the
 * X server the caller set up.
 *
 * Setting DISPLAY is not enough: on a Wayland session Electron reads
 * XDG_SESSION_TYPE and falls back to the default `wayland-0` socket even when
 * WAYLAND_DISPLAY is unset, which puts a live VS Code window on the developer's
 * real screen while the recording captures an empty desktop. The decisive lever
 * is `--ozone-platform=x11` in the `.vscode-test*.mjs` config; these variables
 * are belt-and-suspenders.
 *
 * `extra` is merged in first and the X11 pins are applied after it, so a caller
 * cannot accidentally hand the session back to Wayland. `base` exists for the
 * unit test; callers leave it at `process.env`.
 */
function x11ChildEnv(extra, base) {
    const env = { ...(base ?? process.env), ...extra };
    delete env.WAYLAND_DISPLAY;
    env.XDG_SESSION_TYPE = 'x11';
    env.GDK_BACKEND = 'x11';
    env.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
    return env;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether `cmd` is on PATH. `command -v` is the POSIX shell builtin for this;
 * it is present in every shell we expect (busybox, dash, bash, zsh) and does
 * not assume the standalone `which` binary is installed.
 */
function which(cmd) {
    return (
        spawnSync('sh', ['-c', `command -v ${cmd}`], {
            stdio: ['ignore', 'pipe', 'ignore']
        }).status === 0
    );
}

/** Poll `xdpyinfo` until the X server on `display` answers, or the timeout runs out. */
async function waitForDisplay(display, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const r = spawnSync('xdpyinfo', ['-display', display], {
            stdio: ['ignore', 'ignore', 'ignore']
        });
        if (r.status === 0) return true;
        await sleep(150);
    }
    return false;
}

/**
 * Path to the `vscode-test` entry point inside node_modules.
 *
 * Resolved by hand rather than through require.resolve: `@vscode/test-cli` does
 * not list `out/bin.mjs` or `package.json` in its exports map, so the standard
 * resolver refuses both. The layout is stable enough to address directly.
 */
function resolveVscodeTestBin() {
    const candidate = path.join(repoRoot, 'node_modules', '@vscode', 'test-cli', 'out', 'bin.mjs');
    if (!fs.existsSync(candidate)) {
        throw new Error(`@vscode/test-cli not found at ${candidate}; run \`npm install\` first`);
    }
    return candidate;
}

/**
 * Stop a child process and wait for it to go away, escalating to SIGKILL after
 * four seconds.
 *
 * `stdinQuit` is for ffmpeg, which finalises its output (writing the moov atom)
 * when it reads `q` from stdin; a signal there truncates the recording.
 */
async function stopProcess(child, { stdinQuit = false } = {}) {
    if (!child || child.exitCode !== null) return;
    try {
        if (stdinQuit && child.stdin && !child.stdin.destroyed) {
            child.stdin.write('q');
        } else {
            child.kill('SIGTERM');
        }
    } catch {
        try {
            child.kill('SIGTERM');
        } catch {
            /* ignore */
        }
    }
    await new Promise((resolve) => {
        const timer = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {
                /* ignore */
            }
            resolve();
        }, 4000);
        child.on('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

module.exports = { repoRoot, x11ChildEnv, sleep, which, waitForDisplay, resolveVscodeTestBin, stopProcess };
