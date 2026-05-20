#!/usr/bin/env node
'use strict';

// Автозапись демо-видео расширения через Xvfb + ffmpeg + integration test.
//
// Использование:
//   node scripts/record-demo.js <scenario>
//   node scripts/record-demo.js all
//
// scenario ∈ { task-status, timestamps, clock, agenda }.
//
// Логика одного прогона:
//   1. Запустить Xvfb на DISPLAY :99 (1920x1080x24).
//   2. Запустить ffmpeg -f x11grab для записи DISPLAY в mp4.
//   3. Передать тесту MARKDOWN_ORG_DEMO_MARKER=<tmp path>; в начале действий
//      тест пишет туда {startedAt: Date.now()}.
//   4. Запустить vscode-test с конкретным label через `--label demo-<scenario>`.
//   5. После теста корректно остановить ffmpeg (`q` в stdin), затем Xvfb.
//   6. Прочитать маркер. Trim mp4: -ss <(markerEpoch - ffmpegStartEpoch) / 1000>.
//   7. Из trim-mp4 сгенерировать gif: palettegen + paletteuse (palette в md5-имени).

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const repoRoot = path.join(__dirname, '..');
const mediaDir = path.join(repoRoot, 'media');
fs.mkdirSync(mediaDir, { recursive: true });

const SCENARIOS = ['task-status', 'timestamps', 'clock', 'agenda'];

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

async function stopProcess(child, name) {
    if (!child || child.exitCode !== null) return;
    try {
        // ffmpeg reads `q` from stdin to finalise output cleanly (so the moov
        // atom is written). For Xvfb we just SIGTERM.
        if (name === 'ffmpeg' && child.stdin && !child.stdin.destroyed) {
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

async function recordOne(scenario, display) {
    console.log(`\n[record-demo] === scenario: ${scenario} ===`);

    const vscodeTestBin = resolveVscodeTestBin();

    const rawMp4 = path.join(mediaDir, `demo-${scenario}-raw.mp4`);
    const finalMp4 = path.join(mediaDir, `demo-${scenario}.mp4`);
    const finalGif = path.join(mediaDir, `demo-${scenario}.gif`);
    const palettePng = path.join(mediaDir, `demo-${scenario}-palette.png`);
    const markerPath = path.join(os.tmpdir(), `markdown-org-demo-${process.pid}-${scenario}.json`);

    for (const stale of [rawMp4, finalMp4, finalGif, palettePng, markerPath]) {
        fs.rmSync(stale, { force: true });
    }

    console.log(`[record-demo] starting Xvfb ${display} (1920x1080x24)`);
    const xvfb = spawn('Xvfb', [display, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp', '-noreset'], {
        stdio: ['ignore', 'inherit', 'inherit']
    });

    const ready = await waitForDisplay(display);
    if (!ready) {
        await stopProcess(xvfb, 'xvfb');
        throw new Error(`Xvfb did not come up on ${display}`);
    }

    console.log(`[record-demo] starting ffmpeg -> ${rawMp4}`);
    const ffmpegStartEpoch = Date.now();
    const ffmpeg = spawn(
        'ffmpeg',
        [
            '-loglevel',
            'warning',
            '-f',
            'x11grab',
            '-framerate',
            '30',
            '-video_size',
            '1920x1080',
            '-i',
            display,
            '-y',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            rawMp4
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] }
    );

    await sleep(700);

    console.log(`[record-demo] running vscode-test --label demo-${scenario}`);
    const test = spawn(
        process.execPath,
        [vscodeTestBin, '--config', path.join(repoRoot, '.vscode-test.demo.mjs'), '--label', `demo-${scenario}`],
        {
            stdio: 'inherit',
            env: { ...process.env, DISPLAY: display, MARKDOWN_ORG_DEMO_MARKER: markerPath }
        }
    );

    const testCode = await new Promise((resolve) => {
        test.on('exit', (code) => resolve(code ?? 1));
    });

    await stopProcess(ffmpeg, 'ffmpeg');
    await stopProcess(xvfb, 'xvfb');

    if (testCode !== 0) {
        throw new Error(`test runner exited with code ${testCode}`);
    }

    if (!fs.existsSync(rawMp4) || fs.statSync(rawMp4).size === 0) {
        throw new Error('raw mp4 missing or empty');
    }

    let trimSeconds = 0;
    if (fs.existsSync(markerPath)) {
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
        trimSeconds = Math.max(0, (marker.startedAt - ffmpegStartEpoch) / 1000);
        console.log(`[record-demo] marker offset: ${trimSeconds.toFixed(2)}s`);
    } else {
        console.warn('[record-demo] marker file missing -- using full mp4 as final');
    }

    console.log(`[record-demo] trimming mp4 -> ${finalMp4}`);
    const trim = spawnSync(
        'ffmpeg',
        [
            '-loglevel',
            'warning',
            '-ss',
            trimSeconds.toFixed(3),
            '-i',
            rawMp4,
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            '-y',
            finalMp4
        ],
        { stdio: 'inherit' }
    );
    if (trim.status !== 0) {
        throw new Error('mp4 trim failed');
    }

    console.log(`[record-demo] generating palette -> ${palettePng}`);
    const pal = spawnSync(
        'ffmpeg',
        [
            '-loglevel',
            'warning',
            '-i',
            finalMp4,
            '-vf',
            'fps=15,scale=1280:-1:flags=lanczos,palettegen=stats_mode=diff',
            '-frames:v',
            '1',
            '-update',
            '1',
            '-y',
            palettePng
        ],
        { stdio: 'inherit' }
    );
    if (pal.status !== 0) {
        throw new Error('palettegen failed');
    }

    console.log(`[record-demo] generating gif -> ${finalGif}`);
    const gif = spawnSync(
        'ffmpeg',
        [
            '-loglevel',
            'warning',
            '-i',
            finalMp4,
            '-i',
            palettePng,
            '-lavfi',
            'fps=15,scale=1280:-1:flags=lanczos [v]; [v][1:v] paletteuse=dither=bayer:bayer_scale=5',
            '-y',
            finalGif
        ],
        { stdio: 'inherit' }
    );
    if (gif.status !== 0) {
        throw new Error('gif conversion failed');
    }

    fs.rmSync(rawMp4, { force: true });
    fs.rmSync(palettePng, { force: true });
    fs.rmSync(markerPath, { force: true });

    const mp4Size = fs.statSync(finalMp4).size;
    const gifSize = fs.statSync(finalGif).size;
    return {
        scenario,
        mp4: finalMp4,
        gif: finalGif,
        mp4Mib: mp4Size / 1024 / 1024,
        gifMib: gifSize / 1024 / 1024
    };
}

async function main() {
    for (const cmd of ['Xvfb', 'ffmpeg', 'xdpyinfo']) {
        if (!which(cmd)) {
            console.error(`[record-demo] missing required binary: ${cmd}`);
            process.exit(2);
        }
    }

    const arg = process.argv[2];
    if (!arg) {
        console.error(`[record-demo] usage: node scripts/record-demo.js <${SCENARIOS.join('|')}|all>`);
        process.exit(2);
    }
    const scenarios = arg === 'all' ? SCENARIOS : [arg];
    for (const s of scenarios) {
        if (!SCENARIOS.includes(s)) {
            console.error(`[record-demo] unknown scenario: ${s}`);
            process.exit(2);
        }
    }

    // Compile TS -> out/ once before any recording. .vscode-test.demo.mjs
    // points at out/test/demo/*.js, so a stale build silently replays the
    // previous seed instead of whatever the user just edited.
    console.log('[record-demo] compiling sources (tsc -p .)');
    const tscResult = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', '.'], {
        cwd: repoRoot,
        stdio: 'inherit'
    });
    if (tscResult.status !== 0) {
        throw new Error(`tsc exited with code ${tscResult.status ?? 1}`);
    }

    const display = process.env.RECORD_DEMO_DISPLAY || ':99';
    const results = [];
    for (const s of scenarios) {
        const r = await recordOne(s, display);
        results.push(r);
    }

    console.log('\n[record-demo] all done. summary:');
    for (const r of results) {
        console.log(`  ${r.scenario.padEnd(12)} mp4: ${r.mp4Mib.toFixed(2)} MiB  gif: ${r.gifMib.toFixed(2)} MiB`);
    }
}

main().catch((err) => {
    console.error('[record-demo] failed:', err.message || err);
    process.exit(1);
});
