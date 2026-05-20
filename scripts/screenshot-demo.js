#!/usr/bin/env node
'use strict';

// Авто-снимок статичных PNG-скриншотов расширения через Xvfb + integration test.
//
// Использование:
//   node scripts/screenshot-demo.js
//
// Логика:
//   1. Скомпилировать TS (тот же шаг, что в record-demo.js).
//   2. Запустить Xvfb на DISPLAY :99 (1280x720x24).
//   3. Запустить vscode-test с label demo-screenshots; передать тесту
//      env MARKDOWN_ORG_SCREENSHOT_DIR=<media> и геометрию.
//   4. Тест внутри сценария вызывает captureScreenshot(name), которая
//      сама запускает ffmpeg для одного кадра (-frames:v 1).
//   5. После теста корректно остановить Xvfb.
//
// В отличие от record-demo.js здесь нет общего ffmpeg-видео-захвата --
// каждый PNG снимается точечно через ffmpeg, запущенный самим тестом.

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const repoRoot = path.join(__dirname, '..');
const mediaDir = path.join(repoRoot, 'media');
fs.mkdirSync(mediaDir, { recursive: true });

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function which(cmd) {
    return (
        spawnSync('sh', ['-c', `command -v ${cmd}`], {
            stdio: ['ignore', 'pipe', 'ignore']
        }).status === 0
    );
}

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

function resolveVscodeTestBin() {
    const candidate = path.join(repoRoot, 'node_modules', '@vscode', 'test-cli', 'out', 'bin.mjs');
    if (!fs.existsSync(candidate)) {
        throw new Error(`@vscode/test-cli not found at ${candidate}; run npm install`);
    }
    return candidate;
}

async function stopProcess(child) {
    if (!child || child.exitCode !== null) return;
    try {
        child.kill('SIGTERM');
    } catch {
        /* ignore */
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

// Seed the demo workspace's settings.json BEFORE VS Code starts. `colorTheme`
// is one of the settings VS Code only honours at window load -- updating it
// from inside the test via `config.update(...)` writes the file but does not
// repaint the running window. Seeding the file up front guarantees the
// theme is live by the time `captureScreenshot()` snaps the first PNG.
function seedWorkspaceSettings(workspaceDir, settings) {
    const vscodeDir = path.join(workspaceDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, 'settings.json'), JSON.stringify(settings, null, 4) + '\n', 'utf-8');
}

async function main() {
    for (const cmd of ['Xvfb', 'ffmpeg', 'xdpyinfo']) {
        if (!which(cmd)) {
            console.error(`[screenshot-demo] missing required binary: ${cmd}`);
            process.exit(2);
        }
    }

    const workspaceDir = path.join(repoRoot, 'test-workspace-demo-screenshots');
    fs.mkdirSync(workspaceDir, { recursive: true });
    // Seed only the settings that are safe to apply at cold-start. The
    // colour theme is intentionally NOT seeded here: when VS Code reads
    // workbench.colorTheme from settings.json before the theme-monokai
    // extension is activated, it falls back to the bundled vs-dark and
    // never switches. The test installs the theme at runtime via the
    // workspace config API instead, which fires after extension load.
    seedWorkspaceSettings(workspaceDir, {
        'markdown-org.weekdayLocale': 'en',
        'workbench.activityBar.location': 'hidden',
        'markdown-org.workspaceDir': workspaceDir
    });

    console.log('[screenshot-demo] compiling sources (tsc -p .)');
    const tscResult = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', '.'], {
        cwd: repoRoot,
        stdio: 'inherit'
    });
    if (tscResult.status !== 0) {
        throw new Error(`tsc exited with code ${tscResult.status ?? 1}`);
    }

    const display = process.env.SCREENSHOT_DEMO_DISPLAY || ':99';
    const geometry = '1280x720';

    console.log(`[screenshot-demo] starting Xvfb ${display} (${geometry}x24)`);
    const xvfb = spawn('Xvfb', [display, '-screen', '0', `${geometry}x24`, '-nolisten', 'tcp', '-noreset'], {
        stdio: ['ignore', 'inherit', 'inherit']
    });

    const ready = await waitForDisplay(display);
    if (!ready) {
        await stopProcess(xvfb);
        throw new Error(`Xvfb did not come up on ${display}`);
    }

    const vscodeTestBin = resolveVscodeTestBin();
    console.log('[screenshot-demo] running vscode-test --label demo-screenshots');
    const test = spawn(
        process.execPath,
        [vscodeTestBin, '--config', path.join(repoRoot, '.vscode-test.demo.mjs'), '--label', 'demo-screenshots'],
        {
            stdio: 'inherit',
            env: {
                ...process.env,
                DISPLAY: display,
                MARKDOWN_ORG_SCREENSHOT_DIR: mediaDir,
                MARKDOWN_ORG_SCREENSHOT_GEOMETRY: geometry
            }
        }
    );

    const testCode = await new Promise((resolve) => {
        test.on('exit', (code) => resolve(code ?? 1));
    });

    await stopProcess(xvfb);

    if (testCode !== 0) {
        throw new Error(`test runner exited with code ${testCode}`);
    }

    console.log('\n[screenshot-demo] PNGs written to media/:');
    for (const entry of fs.readdirSync(mediaDir).sort()) {
        if (!entry.endsWith('.png')) continue;
        const size = fs.statSync(path.join(mediaDir, entry)).size;
        console.log(`  ${entry.padEnd(28)} ${(size / 1024).toFixed(1)} KiB`);
    }
}

main().catch((err) => {
    console.error('[screenshot-demo] failed:', err.message || err);
    process.exit(1);
});
