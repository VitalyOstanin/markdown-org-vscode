#!/usr/bin/env node
'use strict';

// Watch-mode for unit tests: run `tsc --watch` and `mocha --watch` side by
// side so saving a .ts file recompiles and reruns the affected unit tests
// without the developer having to remember two terminals.
//
// Implemented as a Node wrapper (rather than `tsc -w -p ./ & mocha --watch
// ...` in package.json) so it works the same way on Linux, macOS and
// Windows shells, and so that Ctrl-C tears down both children at once.

const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function spawnChild(name, command, args) {
    const child = spawn(command, args, { stdio: 'inherit', cwd: ROOT });
    child.on('error', (err) => {
        console.error(`[test-watch] failed to start ${name}: ${err.message}`);
        cleanup();
        process.exit(1);
    });
    return child;
}

let tsc;
let mocha;
let shuttingDown = false;

function cleanup() {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    if (tsc && tsc.exitCode === null) {
        tsc.kill('SIGINT');
    }
    if (mocha && mocha.exitCode === null) {
        mocha.kill('SIGINT');
    }
}

process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
});
process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
});

tsc = spawnChild('tsc', 'npx', ['tsc', '-w', '-p', './']);
mocha = spawnChild('mocha', 'npx', [
    'mocha',
    '--watch',
    '--watch-files',
    'out',
    '--recursive',
    'out/test/unit/**/*.test.js'
]);

tsc.on('exit', (code, signal) => {
    if (!shuttingDown) {
        console.error(`[test-watch] tsc exited (code=${code} signal=${signal}); shutting down`);
        cleanup();
        process.exit(code ?? 1);
    }
});

mocha.on('exit', (code, signal) => {
    if (!shuttingDown) {
        console.error(`[test-watch] mocha exited (code=${code} signal=${signal}); shutting down`);
        cleanup();
        process.exit(code ?? 1);
    }
});
