#!/usr/bin/env node
'use strict';

// Авто-снимок статичных PNG-скриншотов расширения через Xvfb + integration test.
//
// Использование:
//   node scripts/screenshot-demo.js            # обе темы: dark и light
//   node scripts/screenshot-demo.js dark       # только тёмная (Monokai)
//   node scripts/screenshot-demo.js light      # только светлая (Solarized Light)
//
// Тема прогона уезжает в тест через MARKDOWN_ORG_DEMO_THEME; тест сам
// применяет её и добавляет к имени файла суффикс -dark / -light, так что
// README может отдавать читателю набор под его цветовую схему.
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
const { x11ChildEnv, which, waitForDisplay, resolveVscodeTestBin, stopProcess } = require('./lib/x11-harness');

const repoRoot = path.join(__dirname, '..');
const mediaDir = path.join(repoRoot, 'media');
fs.mkdirSync(mediaDir, { recursive: true });

// Write the demo workspace's .vscode/settings.json before VS Code starts, so
// the values are in place at window load. What belongs in here is decided at
// the call site (see captureTheme).
function seedWorkspaceSettings(workspaceDir, settings) {
    const vscodeDir = path.join(workspaceDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, 'settings.json'), JSON.stringify(settings, null, 4) + '\n', 'utf-8');
}

const THEMES = ['dark', 'light'];

async function main() {
    for (const cmd of ['Xvfb', 'ffmpeg', 'xdpyinfo', 'xdotool']) {
        if (!which(cmd)) {
            console.error(`[screenshot-demo] missing required binary: ${cmd}`);
            process.exit(2);
        }
    }

    const requested = process.argv.slice(2);
    const unknown = requested.filter((t) => !THEMES.includes(t));
    if (unknown.length) {
        console.error(`[screenshot-demo] unknown theme(s): ${unknown.join(', ')} (expected ${THEMES.join(' | ')})`);
        process.exit(2);
    }
    const themes = requested.length ? requested : THEMES;

    console.log('[screenshot-demo] compiling sources (tsc -b)');
    const tscResult = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-b'], {
        cwd: repoRoot,
        stdio: 'inherit'
    });
    if (tscResult.status !== 0) {
        throw new Error(`tsc exited with code ${tscResult.status ?? 1}`);
    }

    for (const theme of themes) {
        await captureTheme(theme);
    }

    console.log('\n[screenshot-demo] PNGs written to media/:');
    for (const entry of fs.readdirSync(mediaDir).sort()) {
        if (!entry.endsWith('.png')) continue;
        const size = fs.statSync(path.join(mediaDir, entry)).size;
        console.log(`  ${entry.padEnd(28)} ${(size / 1024).toFixed(1)} KiB`);
    }
}

async function captureTheme(theme) {
    console.log(`\n[screenshot-demo] === theme: ${theme} ===`);
    const workspaceDir = path.join(repoRoot, 'test-workspace-demo-screenshots');
    fs.mkdirSync(workspaceDir, { recursive: true });
    // Seed only the settings that are safe to apply at cold-start. The colour
    // theme is deliberately not among them: applyDemoTheme() sets it at
    // runtime and waits for onDidChangeActiveColorTheme, which is what
    // guarantees the window has finished recolouring before the first PNG is
    // taken. A seeded value gives no such signal, and the run would have to
    // guess how long the repaint takes.
    seedWorkspaceSettings(workspaceDir, {
        'markdown-org.weekdayLocale': 'en',
        'workbench.activityBar.location': 'hidden',
        'markdown-org.workspaceDir': workspaceDir
    });

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
            env: x11ChildEnv({
                DISPLAY: display,
                MARKDOWN_ORG_SCREENSHOT_DIR: mediaDir,
                MARKDOWN_ORG_SCREENSHOT_GEOMETRY: geometry,
                MARKDOWN_ORG_DEMO_THEME: theme
            })
        }
    );

    const testCode = await new Promise((resolve) => {
        test.on('exit', (code) => resolve(code ?? 1));
    });

    await stopProcess(xvfb);

    if (testCode !== 0) {
        throw new Error(`test runner exited with code ${testCode} (theme ${theme})`);
    }
}

main().catch((err) => {
    console.error('[screenshot-demo] failed:', err.message || err);
    process.exit(1);
});
