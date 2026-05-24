import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { suite, test } from 'mocha';

interface Keybinding {
    command: string;
    key: string;
    when?: string;
}

interface PackageJson {
    contributes?: {
        keybindings?: Keybinding[];
        commands?: { command: string; title?: string }[];
    };
}

function loadPackageJson(): PackageJson {
    const file = path.join(__dirname, '..', '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

function findKeybinding(pkg: PackageJson, command: string): Keybinding | undefined {
    return pkg.contributes?.keybindings?.find((kb) => kb.command === command);
}

suite('Keybindings: package.json contract', () => {
    const pkg = loadPackageJson();

    test('markdown-org.insertDeadline is bound to Ctrl+K Ctrl+K Ctrl+D (uniform with insertCreated/insertScheduled)', () => {
        const created = findKeybinding(pkg, 'markdown-org.insertCreated');
        const scheduled = findKeybinding(pkg, 'markdown-org.insertScheduled');
        const deadline = findKeybinding(pkg, 'markdown-org.insertDeadline');

        assert.ok(created, 'insertCreated keybinding must exist');
        assert.ok(scheduled, 'insertScheduled keybinding must exist');
        assert.ok(deadline, 'insertDeadline keybinding must exist');

        assert.strictEqual(created!.key, 'ctrl+k ctrl+k ctrl+c');
        assert.strictEqual(scheduled!.key, 'ctrl+k ctrl+k ctrl+s');
        assert.strictEqual(
            deadline!.key,
            'ctrl+k ctrl+k ctrl+d',
            'insertDeadline must follow the Ctrl+K Ctrl+K Ctrl+<letter> shape used by insertCreated/insertScheduled'
        );
    });

    test('the unified Ctrl+K Ctrl+K Ctrl+D chord does not collide with another command', () => {
        const all = pkg.contributes?.keybindings ?? [];
        const matches = all.filter((kb) => kb.key === 'ctrl+k ctrl+k ctrl+d');
        assert.strictEqual(
            matches.length,
            1,
            `expected exactly one binding on ctrl+k ctrl+k ctrl+d, got ${matches.map((kb) => kb.command).join(', ')}`
        );
        assert.strictEqual(matches[0].command, 'markdown-org.insertDeadline');
    });

    test('Ctrl+K Ctrl+D still belongs to setDone -- the longer chord does not shadow it', () => {
        // Both bindings can coexist: VS Code picks the longer chord once
        // the user types the second Ctrl+K. The shorter Ctrl+K Ctrl+D
        // remains live for setDone when only one Ctrl+K prefix was typed.
        const setDone = findKeybinding(pkg, 'markdown-org.setDone');
        assert.ok(setDone);
        assert.strictEqual(setDone!.key, 'ctrl+k ctrl+d');
    });

    test('insertDeadline is registered as an executable command', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('markdown-org.insertDeadline'),
            'extension must register markdown-org.insertDeadline so the keybinding has a target'
        );
    });

    test('executing markdown-org.insertDeadline inserts a DEADLINE line (smoke test for the chord target)', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n',
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        try {
            await vscode.commands.executeCommand('markdown-org.insertDeadline');

            const line1 = document.lineAt(1).text;
            assert.ok(line1.startsWith('`DEADLINE: <'), `expected active DEADLINE, got: ${line1}`);
            assert.ok(line1.endsWith('>`'));
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });
});
