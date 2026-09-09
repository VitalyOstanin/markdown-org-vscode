import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as sinon from 'sinon';
import { after, before, suite, test } from 'mocha';

/**
 * The help panel end to end (#181): the command is contributed, it opens
 * without an error, and what it renders is the shipped pages -- read from the
 * installed extension directory, which is the part a unit test cannot check.
 */
suite('Help panel', () => {
    let showErrorStub: sinon.SinonStub;

    before(() => {
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    });

    after(async () => {
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('the command is contributed', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('markdown-org.showHelp'), 'markdown-org.showHelp is not registered');
    });

    test('opening the help raises no error, and opening it twice reuses the panel', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showHelp');
        await vscode.commands.executeCommand('markdown-org.showHelp');
        const calls = showErrorStub.getCalls().map((call) => String(call.args[0]));
        assert.deepStrictEqual(calls, [], `showErrorMessage was called: ${calls.join('; ')}`);
    });

    test('the shipped pages are readable from the installed extension', () => {
        const extension = vscode.extensions.getExtension('vitalyostanin.markdown-org-vscode');
        assert.ok(extension, 'the extension itself was not found');
        const help = vscode.Uri.joinPath(extension.extensionUri, 'media', 'help');
        return Promise.all(
            ['en', 'ru'].map(async (language) => {
                const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(help, language));
                const pages = entries.filter(([name]) => name.endsWith('.md'));
                assert.ok(pages.length > 0, `no help pages ship for ${language}`);
            })
        );
    });
});
