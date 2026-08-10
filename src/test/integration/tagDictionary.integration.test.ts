import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { currentTagDictionary } from '../../utils/agendaTags';
import { TAGS_FILE } from '../../utils/tagSources';

/**
 * The tags a notes directory carries, as the running extension reads them.
 *
 * The merge itself is settled by the unit tests; what is only answerable here
 * is whether the files under the configured directories are found at all, and
 * whether the command that explains the result opens with it.
 */
suite('Tags declared beside the notes', () => {
    const root = path.join(__dirname, '../../test-workspace-tag-dictionary');
    const work = path.join(root, 'work');
    const home = path.join(root, 'home');

    /** What `workspaceDirs` was before this suite pointed it at its own notes. */
    let previousDirs: string[] | undefined;

    function declare(directory: string, tags: unknown[]): void {
        const file = path.join(directory, TAGS_FILE);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(tags), 'utf8');
    }

    before(() => {
        fs.mkdirSync(work, { recursive: true });
        fs.mkdirSync(home, { recursive: true });
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        previousDirs = config.inspect<string[]>('workspaceDirs')?.workspaceValue;
        await config.update('workspaceDirs', [work, home], vscode.ConfigurationTarget.Workspace);
        await config.update('fileTags', [], vscode.ConfigurationTarget.Workspace);
    });

    afterEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDirs', previousDirs, vscode.ConfigurationTarget.Workspace);
        await config.update('fileTags', undefined, vscode.ConfigurationTarget.Workspace);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('both directories are read and their tags merge into one dictionary', async () => {
        declare(work, [
            { name: 'ALL', pattern: '' },
            { name: 'TASKS', pattern: 'task' }
        ]);
        declare(home, [{ name: 'BILLS', pattern: 'bill' }]);

        const dictionary = await currentTagDictionary();

        assert.deepStrictEqual(
            dictionary.map((tag) => tag.name),
            ['ALL', 'TASKS', 'BILLS']
        );
    });

    test('the settings are merged in beside the files', async () => {
        declare(work, [{ name: 'TASKS', pattern: 'task' }]);
        declare(home, []);
        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('fileTags', [{ name: 'FROM_SETTINGS', pattern: 'x' }], vscode.ConfigurationTarget.Workspace);

        const dictionary = await currentTagDictionary();

        assert.deepStrictEqual(
            dictionary.map((tag) => tag.name),
            ['TASKS', 'FROM_SETTINGS']
        );
    });

    test('a file that will not parse leaves the other directory readable', async () => {
        fs.mkdirSync(path.dirname(path.join(work, TAGS_FILE)), { recursive: true });
        fs.writeFileSync(path.join(work, TAGS_FILE), '{ not json', 'utf8');
        declare(home, [{ name: 'BILLS', pattern: 'bill' }]);

        const dictionary = await currentTagDictionary();

        assert.deepStrictEqual(
            dictionary.map((tag) => tag.name),
            ['BILLS']
        );
    });

    test('the command opens a document naming each pattern and where it came from', async () => {
        declare(work, [{ name: 'WORK', include: ['work'], exclude: ['archive'] }]);
        declare(home, []);

        await vscode.commands.executeCommand('markdown-org.showTagDictionary');

        const shown = vscode.window.activeTextEditor?.document.getText() ?? '';
        assert.match(shown, /## WORK/);
        assert.match(shown, new RegExp(`takes notes whose name holds "work" — declared by ${work}`));
        assert.match(shown, new RegExp(`keeps out notes whose name holds "archive" — declared by ${work}`));
    });
});
