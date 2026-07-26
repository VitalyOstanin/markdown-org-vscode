import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const testWorkspace = resolve(here, 'test-workspace');

// The test workspace folder must exist before VS Code launches: an absent
// `launchArgs[0]` is interpreted as "no folder" mode, and any test that
// touches `vscode.workspace.workspaceFolders[0]` or writes a Workspace-scope
// setting fails. The clone is clean on CI, so the directory has to be
// re-created on every run.
mkdirSync(testWorkspace, { recursive: true });

export default defineConfig({
    tests: [
        {
            label: 'integration',
            files: 'out/test/integration/**/*.integration.test.js',
            extensionDevelopmentPath: here,
            workspaceFolder: testWorkspace,
            // Pin the test VS Code to the X11/Ozone backend -- on Linux only.
            // On a Wayland session Electron would otherwise auto-select
            // Wayland and open a real window even under xvfb (which only
            // provides an X server); forcing x11 keeps the test host on
            // xvfb's virtual display. Ozone does not exist on macOS or
            // Windows, so the flag is not passed there (it matches the
            // wrapper, which sets its X11 env vars on the Linux path only).
            launchArgs: process.platform === 'linux' ? ['--ozone-platform=x11'] : [],
            mocha: {
                ui: 'tdd',
                color: true,
                timeout: 10000,
                slow: 4000
            }
        }
    ],
    coverage: {
        // Default mode: only files that were loaded by the integration
        // tests appear in the report. `includeAll` would also walk the
        // source tree to surface unloaded files, but currently mis-resolves
        // when our compiled output lives in `out/` rather than `src/`, so
        // we keep the loaded-only view until the upstream behaviour is
        // pinned down.
        // `out/webview/**` is excluded for the same reason the unit profile
        // excludes it: that code runs inside the page, where the host's V8
        // coverage does not reach. What the report showed for it was the file
        // being read for inlining -- 20% of lines, 0% of functions -- 13% of
        // the denominator pinned at a number no test can move. Leaving it in
        // both flattered the gate (a real drop elsewhere hid behind it) and
        // punished the client for growing. See TODO.md for how that code is
        // meant to be covered instead.
        exclude: ['**/*.test.js', '**/*.integration.test.js', '**/*.d.ts', '**/*.map', '**/webview/**'],
        reporter: ['lcov', 'text-summary']
        // NOTE: `output` is intentionally not set here. As of
        // @vscode/test-cli 0.0.12, the config-file `coverage.output` field
        // is dropped on the floor (only the CLI flag `--coverage-output`
        // wins). We pass the destination via package.json scripts instead.
    }
});
