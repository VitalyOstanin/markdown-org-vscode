import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

function demoEntry(label, file, workspaceName) {
    const workspaceFolder = resolve(here, workspaceName);
    mkdirSync(workspaceFolder, { recursive: true });
    return {
        label,
        files: `out/test/demo/${file}`,
        extensionDevelopmentPath: here,
        workspaceFolder,
        // Pin Electron to X11 so the recording actually lands on the driver's
        // Xvfb display. On a Wayland session Electron auto-selects the Wayland
        // backend and connects to the real compositor -- the demo window then
        // opens on the developer's own screen and the Xvfb capture records an
        // empty desktop (xdotool also finds no window there). This launch arg
        // is the decisive lever; the drivers additionally scrub the Wayland
        // hints out of the child environment. Same treatment as
        // `.vscode-test.mjs` for the integration suite.
        launchArgs: process.platform === 'linux' ? ['--ozone-platform=x11'] : [],
        mocha: {
            ui: 'tdd',
            color: true,
            timeout: 90000,
            slow: 30000
        }
    };
}

export default defineConfig({
    tests: [
        demoEntry('demo-task-status', 'taskStatus.demo.test.js', 'test-workspace-demo-task-status'),
        demoEntry('demo-timestamps', 'timestamps.demo.test.js', 'test-workspace-demo-timestamps'),
        demoEntry('demo-clock', 'clock.demo.test.js', 'test-workspace-demo-clock'),
        demoEntry('demo-agenda', 'agenda.demo.test.js', 'test-workspace-demo-agenda'),
        demoEntry('demo-gcal-connect', 'gcalConnect.demo.test.js', 'test-workspace-demo-gcal-connect'),
        demoEntry('demo-gcal-select', 'gcalSelectCalendar.demo.test.js', 'test-workspace-demo-gcal-select'),
        demoEntry('demo-gcal-sync', 'gcalSyncNow.demo.test.js', 'test-workspace-demo-gcal-sync'),
        demoEntry('demo-screenshots', 'screenshots.demo.test.js', 'test-workspace-demo-screenshots')
    ]
});
