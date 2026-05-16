import * as path from 'path';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

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

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [testWorkspace]
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
