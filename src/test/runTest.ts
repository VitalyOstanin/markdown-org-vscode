import * as path from 'path';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

const INTEGRATION_HOST_TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/integration');
        const testWorkspace = path.resolve(__dirname, '../../test-workspace');

        // VS Code only treats `launchArgs` entries as a workspace folder when
        // they point to an existing directory. On a clean clone (CI) the path
        // doesn't exist yet, the editor falls back to "no folder" mode, and
        // every test that touches `vscode.workspace.workspaceFolders[0]` or
        // updates Workspace-scoped settings fails. Make sure the folder is
        // there before we hand it to test-electron.
        fs.mkdirSync(testWorkspace, { recursive: true });

        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`Integration host exceeded global timeout of ${INTEGRATION_HOST_TIMEOUT_MS}ms`));
            }, INTEGRATION_HOST_TIMEOUT_MS);
            timer.unref?.();
        });

        try {
            await Promise.race([
                runTests({
                    extensionDevelopmentPath,
                    extensionTestsPath,
                    launchArgs: [testWorkspace]
                }),
                timeout
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
