import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { suite, before, after, beforeEach, test } from 'mocha';

suite('Tag Filter Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile1 = path.join(testWorkspaceDir, 'work-tasks.md');
    const testFile2 = path.join(testWorkspaceDir, 'personal-tasks.md');

    const baseFileTags = [
        { name: 'ALL', pattern: '' },
        { name: 'WORK', pattern: 'work' },
        { name: 'PERSONAL', pattern: 'personal' }
    ];

    before(async () => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }

        fs.writeFileSync(testFile1, `## TODO [#A] Work task\n\`SCHEDULED: <2025-12-07 Sun>\``);
        fs.writeFileSync(testFile2, `## TODO Personal task\n\`SCHEDULED: <2025-12-07 Sun>\``);

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('fileTags', baseFileTags, vscode.ConfigurationTarget.Workspace);
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', undefined, vscode.ConfigurationTarget.Global);
        await config.update('fileTags', baseFileTags, vscode.ConfigurationTarget.Workspace);
    });

    after(async () => {
        [testFile1, testFile2].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('currentTag', undefined, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', undefined, vscode.ConfigurationTarget.Global);
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

    test('cycleTag persists at workspace scope when a workspace is open', async function () {
        this.timeout(5000);

        await vscode.commands.executeCommand('markdown-org.cycleTag');

        const inspected = vscode.workspace.getConfiguration('markdown-org').inspect<string>('currentTag');
        assert.ok(inspected, 'inspect should return a result');
        assert.strictEqual(inspected.workspaceValue, 'WORK', 'workspace value should be set');
        assert.notStrictEqual(inspected.globalValue, 'WORK', 'global value should not be touched');
    });

    test('cycleTag recovers from unknown currentTag by selecting the first tag', async function () {
        this.timeout(5000);

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('currentTag', 'DOES_NOT_EXIST', vscode.ConfigurationTarget.Workspace);

        await vscode.commands.executeCommand('markdown-org.cycleTag');

        const after = vscode.workspace.getConfiguration('markdown-org');
        assert.strictEqual(after.get('currentTag'), baseFileTags[0].name);
    });

    test('cycleTag warns when fileTags is empty', async function () {
        this.timeout(5000);

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('fileTags', [], vscode.ConfigurationTarget.Workspace);

        // Should not throw; behavior is a warning + no-op.
        await vscode.commands.executeCommand('markdown-org.cycleTag');

        const after = vscode.workspace.getConfiguration('markdown-org');
        assert.strictEqual(after.get('currentTag'), 'ALL', 'currentTag must stay unchanged');
    });
});
