import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as sinon from 'sinon';
import { suite, beforeEach, afterEach, test } from 'mocha';

/**
 * Integration coverage for **Move to Archive**
 * (`markdown-org.moveToArchive`). The heading under the cursor, its body and
 * its child headings are cut from the active document and appended to a
 * sibling `<file>.archive.md`, under a copy of the ancestor chain so the
 * archived entry keeps its place in the outline.
 *
 * The block maths is unit-tested separately (`extractHeading.test.ts`,
 * `blockDeletion.test.ts`); what runs here is the editor binding -- the
 * isTrusted gate, the atomic write of the archive file, the edit against the
 * open document, and what the user is told when that edit is refused.
 *
 * The refusal case matters because the command touches two files: the archive
 * is written first, so an edit the host declines would leave the block in both
 * places while the toast claims a move.
 */

// Use the *open* workspace folder as the test root: `__dirname/../../`
// resolves to `out/test-workspace` after tsc compiles into `out/`, while
// vscode-test-cli launches with the top-level `<repo>/test-workspace` folder
// (see `.vscode-test.mjs`).
function getTestWorkspaceDir(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        throw new Error('integration tests require a workspace folder');
    }
    return root;
}
const tmpRootName = 'move-to-archive.tmp';

function freshSourceFile(name: string): string {
    const tmpRoot = path.join(getTestWorkspaceDir(), tmpRootName);
    fs.mkdirSync(tmpRoot, { recursive: true });
    const dir = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
    return path.join(dir, 'source.md');
}

async function openAt(file: string, headingLine: number): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(headingLine, 0, headingLine, 0);
    return editor;
}

const SOURCE = [
    '# Project Alpha',
    '',
    '## Sprint 12',
    '',
    '### DONE Ship the parser',
    '`CLOSED: [2026-06-01]`',
    'notes...',
    '',
    '### TODO Keep this one',
    ''
].join('\n');

suite('Move to Archive: integration', () => {
    let errorStub: sinon.SinonStub;
    let infoStub: sinon.SinonStub;

    beforeEach(() => {
        errorStub = sinon.stub(vscode.window, 'showErrorMessage');
        infoStub = sinon.stub(vscode.window, 'showInformationMessage');
    });

    afterEach(async () => {
        sinon.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        // Best-effort cleanup of the per-test scratch tree; see the same
        // teardown in promoteToMaintain.integration.test.ts for why a failure
        // here is swallowed.
        const tmpRoot = path.join(getTestWorkspaceDir(), tmpRootName);
        if (fs.existsSync(tmpRoot)) {
            for (const child of fs.readdirSync(tmpRoot)) {
                try {
                    fs.rmSync(path.join(tmpRoot, child), {
                        recursive: true,
                        force: true,
                        maxRetries: 10,
                        retryDelay: 100
                    });
                } catch {
                    // ignore: unique scratch dir per test, no impact on others
                }
            }
        }
    });

    test('appends the block with its ancestors and cuts it from the source', async function () {
        this.timeout(15000);
        const sourceFile = freshSourceFile('happy-path');
        fs.writeFileSync(sourceFile, SOURCE);

        const editor = await openAt(sourceFile, 4); // '### DONE Ship the parser'

        await vscode.commands.executeCommand('markdown-org.moveToArchive');

        if (errorStub.called) {
            assert.fail(`moveToArchive reported: ${(errorStub.firstCall.args as string[])[0]}`);
        }

        const archiveText = fs.readFileSync(`${sourceFile}.archive.md`, 'utf8');
        assert.match(archiveText, /^# Project Alpha\n## Sprint 12\n### DONE Ship the parser\n/, archiveText);
        assert.match(archiveText, /`CLOSED: \[2026-06-01\]`/);
        assert.match(archiveText, /notes\.\.\./);
        assert.ok(!archiveText.includes('### TODO Keep this one'), `sibling was archived too:\n${archiveText}`);

        const sourceText = editor.document.getText();
        assert.ok(!sourceText.includes('### DONE Ship the parser'), `source still has the heading:\n${sourceText}`);
        assert.match(sourceText, /### TODO Keep this one/, 'sibling heading must be preserved');
        assert.match(sourceText, /## Sprint 12/, 'ancestor heading must stay in the source');

        assert.ok(infoStub.called, 'expected an info toast confirming the move');
        const [message] = infoStub.firstCall.args as [string];
        assert.match(message, /Moved to source\.md\.archive\.md/, `unexpected toast text: ${message}`);
    });

    test('appends to an existing archive that does not end in a blank line', async function () {
        this.timeout(15000);
        const sourceFile = freshSourceFile('append');
        fs.writeFileSync(sourceFile, SOURCE);
        // No trailing blank line, not even a trailing newline: the command has
        // to pad it so the archived entry does not fuse with the last line.
        fs.writeFileSync(`${sourceFile}.archive.md`, '# Older archive\n## An earlier entry\nold body');

        await openAt(sourceFile, 4);

        await vscode.commands.executeCommand('markdown-org.moveToArchive');

        if (errorStub.called) {
            assert.fail(`moveToArchive reported: ${(errorStub.firstCall.args as string[])[0]}`);
        }

        const archiveText = fs.readFileSync(`${sourceFile}.archive.md`, 'utf8');
        assert.ok(archiveText.startsWith('# Older archive\n'), `earlier content must stay on top:\n${archiveText}`);
        assert.match(archiveText, /old body\n\n# Project Alpha\n/, `entries must be separated:\n${archiveText}`);
        assert.match(archiveText, /### DONE Ship the parser/);
    });

    test('refuses to write through a symlinked archive file', async function () {
        this.timeout(15000);
        const sourceFile = freshSourceFile('symlink');
        fs.writeFileSync(sourceFile, SOURCE);
        // The archive path is a symlink pointing elsewhere: following it would
        // write to a file the user never named.
        const elsewhere = path.join(path.dirname(sourceFile), 'elsewhere.md');
        fs.writeFileSync(elsewhere, 'untouched\n');
        fs.symlinkSync(elsewhere, `${sourceFile}.archive.md`);

        const editor = await openAt(sourceFile, 4);

        await vscode.commands.executeCommand('markdown-org.moveToArchive');

        assert.ok(errorStub.called, 'expected the symlinked archive to be refused');
        const [message] = errorStub.firstCall.args as [string];
        assert.match(message, /symlink/i, `expected the toast to name the reason: ${message}`);
        assert.strictEqual(fs.readFileSync(elsewhere, 'utf8'), 'untouched\n', 'the link target must be left alone');
        assert.match(editor.document.getText(), /### DONE Ship the parser/, 'the source must be untouched');
    });

    test('a refused edit leaves no copy behind and says so', async function () {
        this.timeout(15000);
        const sourceFile = freshSourceFile('refused-edit');
        fs.writeFileSync(sourceFile, SOURCE);

        const editor = await openAt(sourceFile, 4);
        // The host declines the edit: the document moved on since the version
        // the edit was built against, it is read-only, or another participant
        // claimed it. Nothing was written to the source in that case.
        const applyEdit = sinon.stub(vscode.workspace, 'applyEdit').resolves(false);

        await vscode.commands.executeCommand('markdown-org.moveToArchive');

        assert.ok(applyEdit.called, 'the command must have tried to edit the source');
        assert.ok(errorStub.called, 'a refused edit must be reported');
        assert.ok(!infoStub.called, `a refused move must not claim success: ${JSON.stringify(infoStub.args)}`);

        // The block stays exactly where it was -- and nowhere else. Either the
        // archive was never written or what was written has been taken back.
        const archivePath = `${sourceFile}.archive.md`;
        const archiveText = fs.existsSync(archivePath) ? fs.readFileSync(archivePath, 'utf8') : '';
        assert.ok(
            !archiveText.includes('### DONE Ship the parser'),
            `the archive kept a copy of a block that was never cut:\n${archiveText}`
        );
        assert.match(editor.document.getText(), /### DONE Ship the parser/, 'the source must be untouched');
    });
});
