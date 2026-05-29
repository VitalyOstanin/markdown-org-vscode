import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { suite, beforeEach, afterEach, test } from 'mocha';

/**
 * Integration coverage for **Promote to Maintain**
 * (`markdown-org.promoteToMaintain`). The command is the primary tool for
 * migrating tasks from an older planner into the current maintain file: the
 * heading under the cursor (with its body and child headings) is cut from
 * the active document and appended to the maintain file's `# incoming`
 * section, normalised to a `## ` root.
 *
 * The pure heading / re-level math is unit-tested separately in
 * `maintainPromote.test.ts`; what is exercised here is the editor binding:
 * settings lookup, workspace-relative path resolution, isTrusted gate,
 * applyEdit on the source, atomicWrite of the maintain file, and the
 * `vscode.window.showErrorMessage` plumbing for misconfigured inputs.
 */

// Use the *open* workspace folder as the test root: `__dirname/../../`
// resolves to `out/test-workspace` after tsc compiles into `out/`, while
// vscode-test-cli launches with the top-level `<repo>/test-workspace` folder
// (see `.vscode-test.mjs`). Reading the folder from VS Code's own state
// guarantees the paths line up with `resolveWorkspacePath`'s view.
function getTestWorkspaceDir(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        throw new Error('integration tests require a workspace folder');
    }
    return root;
}
const tmpRootName = 'promote-to-maintain.tmp';

interface Setup {
    sourceFile: string;
    maintainFile: string;
    sourceRel: string;
    maintainRel: string;
}

function freshSetup(name: string): Setup {
    const root = getTestWorkspaceDir();
    const tmpRoot = path.join(root, tmpRootName);
    fs.mkdirSync(tmpRoot, { recursive: true });
    const dir = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
    return {
        sourceFile: path.join(dir, 'source.md'),
        maintainFile: path.join(dir, 'maintain.md'),
        sourceRel: path.relative(root, path.join(dir, 'source.md')),
        maintainRel: path.relative(root, path.join(dir, 'maintain.md'))
    };
}

/** Open the source file in an editor and place the caret on the given line. */
async function openAt(file: string, headingLine: number): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(headingLine, 0, headingLine, 0);
    return editor;
}

suite('Promote to Maintain: integration', () => {
    let errorStub: sinon.SinonStub;
    let infoStub: sinon.SinonStub;

    beforeEach(() => {
        // Capture the user-visible notifications instead of letting them
        // queue up across tests. notifyError -> showErrorMessage,
        // notifyInfo -> showInformationMessage.
        errorStub = sinon.stub(vscode.window, 'showErrorMessage');
        infoStub = sinon.stub(vscode.window, 'showInformationMessage');
    });

    afterEach(async () => {
        errorStub.restore();
        infoStub.restore();
        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('maintainFilePath', undefined, vscode.ConfigurationTarget.Workspace);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        // Wipe the per-test scratch tree; keep the tmpRoot directory itself
        // so a follow-up test inside the suite does not race on mkdir.
        const tmpRoot = path.join(getTestWorkspaceDir(), tmpRootName);
        if (fs.existsSync(tmpRoot)) {
            for (const child of fs.readdirSync(tmpRoot)) {
                // maxRetries/retryDelay: on Windows the OS may still hold a handle
                // on a just-closed editor's file when this teardown runs, so a bare
                // rmSync hits EBUSY (`force` only swallows ENOENT, not EBUSY). Node's
                // rimraf retries on EBUSY/EPERM when maxRetries > 0.
                fs.rmSync(path.join(tmpRoot, child), {
                    recursive: true,
                    force: true,
                    maxRetries: 10,
                    retryDelay: 100
                });
            }
        }
    });

    test('appends under an existing `# incoming` and removes the block from the source', async function () {
        this.timeout(15000);
        const setup = freshSetup('with-incoming');

        // Source: a level-2 task block with a child heading and a planning
        // line. The cursor lands on the heading line itself.
        fs.writeFileSync(
            setup.sourceFile,
            [
                '# Project Alpha',
                '',
                '## TODO Migrate ticket 42',
                '`SCHEDULED: <2026-06-01>`',
                '',
                '### Subtask: collect data',
                'notes...',
                '',
                '## TODO Other task',
                ''
            ].join('\n')
        );
        // Maintain file already has the inbox section with an older entry.
        fs.writeFileSync(setup.maintainFile, '# incoming\n## Older entry\nold body\n');

        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('maintainFilePath', setup.maintainRel, vscode.ConfigurationTarget.Workspace);

        const editor = await openAt(setup.sourceFile, 2); // line of '## TODO Migrate ticket 42'

        await vscode.commands.executeCommand('markdown-org.promoteToMaintain');

        // Surface any silent error before the harder asserts hit.
        if (errorStub.called) {
            assert.fail(`promoteToMaintain reported: ${(errorStub.firstCall.args as string[])[0]}`);
        }

        // The maintain file gets the new block right after `# incoming`,
        // with the source heading re-rooted at `## ` and child headings
        // re-levelled by delta = 2 - 2 = 0 (so `### Subtask` stays `###`).
        const maintainText = fs.readFileSync(setup.maintainFile, 'utf8');
        assert.ok(maintainText.startsWith('# incoming\n'), `maintain must keep # incoming on top: ${maintainText}`);
        assert.match(maintainText, /## TODO Migrate ticket 42/);
        assert.match(maintainText, /`SCHEDULED: <2026-06-01>`/);
        assert.match(maintainText, /### Subtask: collect data/);
        assert.match(maintainText, /## Older entry/, 'the pre-existing entry must still be present');
        // Order: incoming -> new block -> blank -> older entry.
        assert.ok(
            maintainText.indexOf('## TODO Migrate ticket 42') < maintainText.indexOf('## Older entry'),
            `new block must land before the older entry:\n${maintainText}`
        );

        // The source document (still open in the editor, unsaved) no longer
        // contains the promoted heading or its body, but the *other* heading
        // is untouched.
        const sourceText = editor.document.getText();
        assert.ok(!sourceText.includes('## TODO Migrate ticket 42'), `source still has the heading:\n${sourceText}`);
        assert.ok(!sourceText.includes('### Subtask: collect data'), `source still has the child:\n${sourceText}`);
        assert.match(sourceText, /## TODO Other task/, 'sibling heading must be preserved');

        // Info notification confirms the destination.
        assert.ok(infoStub.called, 'expected an info toast confirming the promotion');
        const [message] = infoStub.firstCall.args as [string];
        assert.match(message, /Promoted to maintain\.md/, `unexpected toast text: ${message}`);
    });

    test('creates `# incoming` if the maintain file lacks one', async function () {
        this.timeout(15000);
        const setup = freshSetup('no-incoming');

        fs.writeFileSync(setup.sourceFile, '# Notes\n## TODO Move me\nbody\n');
        // Maintain has prior content but no `# incoming` heading.
        fs.writeFileSync(setup.maintainFile, '# Triaged\n\n## Already done\n');

        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('maintainFilePath', setup.maintainRel, vscode.ConfigurationTarget.Workspace);

        await openAt(setup.sourceFile, 1);

        await vscode.commands.executeCommand('markdown-org.promoteToMaintain');

        const maintainText = fs.readFileSync(setup.maintainFile, 'utf8');
        assert.match(maintainText, /# Triaged/, 'previous content preserved');
        assert.match(maintainText, /# incoming/, '# incoming section was created');
        assert.ok(
            maintainText.indexOf('# Triaged') < maintainText.indexOf('# incoming'),
            'pre-existing content stays on top, # incoming is appended'
        );
        assert.match(maintainText, /## TODO Move me/);
    });

    test('creates the maintain file from scratch when it does not exist yet', async function () {
        this.timeout(15000);
        const setup = freshSetup('fresh');

        fs.writeFileSync(setup.sourceFile, '# Inbox\n## TODO First migration\nnotes\n');
        // No maintainFile on disk: the command must create it.

        await vscode.workspace
            .getConfiguration('markdown-org')
            .update('maintainFilePath', setup.maintainRel, vscode.ConfigurationTarget.Workspace);

        await openAt(setup.sourceFile, 1);

        await vscode.commands.executeCommand('markdown-org.promoteToMaintain');

        assert.ok(fs.existsSync(setup.maintainFile), 'maintain file must be created on first promote');
        const maintainText = fs.readFileSync(setup.maintainFile, 'utf8');
        // extractHeadingBlockLines preserves the source's trailing-newline
        // shape (the source ended with '\n'), so the slice'd body lines
        // include an empty tail entry; joined back with '\n' that becomes
        // an extra '\n' at the end. Locking in the exact string keeps the
        // command's formatting stable across refactors.
        assert.strictEqual(
            maintainText,
            '# incoming\n## TODO First migration\nnotes\n\n',
            `unexpected initial maintain contents: ${JSON.stringify(maintainText)}`
        );
    });

    test('refuses when markdown-org.maintainFilePath is not configured', async function () {
        this.timeout(15000);
        const setup = freshSetup('no-setting');
        fs.writeFileSync(setup.sourceFile, '# Notes\n## TODO X\n');

        // maintainFilePath is intentionally left at its default (empty).
        await openAt(setup.sourceFile, 1);

        await vscode.commands.executeCommand('markdown-org.promoteToMaintain');

        assert.ok(errorStub.called, 'expected an error toast when maintainFilePath is missing');
        const [message] = errorStub.firstCall.args as [string];
        assert.match(message, /maintainFilePath/, `expected the toast to name the setting: ${message}`);
    });
});
