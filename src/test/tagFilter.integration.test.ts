import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { suite, before, after, test } from 'mocha';

suite('Tag Filter Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile1 = path.join(testWorkspaceDir, 'work-tasks.md');
    const testFile2 = path.join(testWorkspaceDir, 'personal-tasks.md');

    before(async () => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }

        fs.writeFileSync(testFile1, `## TODO [#A] Work task\n\`SCHEDULED: <2025-12-07 Sun>\``);
        fs.writeFileSync(testFile2, `## TODO Personal task\n\`SCHEDULED: <2025-12-07 Sun>\``);

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update(
            'fileTags',
            [
                { name: 'ALL', pattern: '' },
                { name: 'WORK', pattern: 'work' },
                { name: 'PERSONAL', pattern: 'personal' }
            ],
            vscode.ConfigurationTarget.Workspace
        );
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Global);
    });

    after(async () => {
        [testFile1, testFile2].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Global);
    });

    test('cycleTag command switches between tags', async function () {
        this.timeout(5000);

        await vscode.commands.executeCommand('markdown-org.cycleTag');
        let config = vscode.workspace.getConfiguration('markdown-org');
        assert.strictEqual(config.get('currentTag'), 'WORK');

        await vscode.commands.executeCommand('markdown-org.cycleTag');
        config = vscode.workspace.getConfiguration('markdown-org');
        assert.strictEqual(config.get('currentTag'), 'PERSONAL');

        await vscode.commands.executeCommand('markdown-org.cycleTag');
        config = vscode.workspace.getConfiguration('markdown-org');
        assert.strictEqual(config.get('currentTag'), 'ALL');
    });
});
