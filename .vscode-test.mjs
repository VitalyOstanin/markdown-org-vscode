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
        exclude: ['**/*.test.js', '**/*.integration.test.js', '**/*.d.ts', '**/*.map'],
        reporter: ['lcov', 'text-summary']
        // NOTE: `output` is intentionally not set here. As of
        // @vscode/test-cli 0.0.12, the config-file `coverage.output` field
        // is dropped on the floor (only the CLI flag `--coverage-output`
        // wins). We pass the destination via package.json scripts instead.
    }
});
