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
        demoEntry('demo-screenshots', 'screenshots.demo.test.js', 'test-workspace-demo-screenshots')
    ]
});
