import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as sinon from 'sinon';
import { suite, before, beforeEach, after, afterEach, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { toIsoDate } from '../../utils/isoDate';
import { AgendaPanel } from '../../views/agendaPanel';
import { collectDirtyStatus } from '../../utils/collectDirtyStatus';
import { makeExtractorFake } from '../_execFake';
import { waitForAgendaRender, waitUntil } from './_helpers';

/**
 * The bug this chip exists for: a file open with unsaved edits has its own
 * line numbering, and the extractor's is off it by however many lines the
 * unsaved edit added or removed above the target. `collectGitStatus.ts` has
 * the equivalent suite against a real repository; this is the equivalent
 * against a real, edited-but-unsaved document.
 */
suite('agenda dirty status against a real document', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-dirty.md');
    const today = toIsoDate(new Date());

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    before(() => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        fs.writeFileSync(testFile, '## TODO A task\n');
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);
        await config.update('uiLanguage', 'auto', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(
            makeExtractorFake({
                day: [
                    {
                        date: today,
                        scheduled_no_time: [
                            { file: testFile, line: 1, heading: 'A task', content: '', task_type: 'TODO' }
                        ]
                    }
                ],
                week: [],
                month: [],
                tasks: [],
                holidays: []
            })
        );
        showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
    });

    afterEach(async () => {
        execFileStub.restore();
        resolveExtractorStub.restore();
        showErrorStub.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    test('the chip carries an open document once it holds unsaved edits, and clears once it is saved', async function () {
        this.timeout(30000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const doc = await vscode.workspace.openTextDocument(testFile);
        const editor = await vscode.window.showTextDocument(doc);
        // Inserted above the task's own line, the same shape as the reported
        // bug: an unrelated paste at the top of the file, saved or not, shifts
        // every task below it by however many lines it added.
        await editor.edit((builder) => {
            builder.insert(new vscode.Position(0, 0), '# a note pasted above the task\n\n');
        });
        assert.ok(doc.isDirty, 'the edit above did not leave the document dirty');

        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info !== null && info.dirtyChip !== '';
        }, 'the header to carry a dirty chip once the edit reaches it');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.ok(
            info.dirtyFiles.some((file) => path.resolve(file) === path.resolve(testFile)),
            `the dropdown did not list ${testFile}: ${JSON.stringify(info.dirtyFiles)}`
        );

        await AgendaPanel.clickDirtySaveForTesting();
        await waitUntil(() => !doc.isDirty, 'the document to be saved');
        await waitUntil(async () => {
            const after = await AgendaPanel.queryRenderedInfoForTesting();
            return after !== null && after.dirtyChip === '';
        }, 'the chip to clear once nothing in view is unsaved');

        assert.match(
            fs.readFileSync(testFile, 'utf-8'),
            /^# a note pasted above the task/,
            'the save button did not write the edited buffer to disk'
        );
    });

    test('a document with no unsaved edits carries no chip', async function () {
        this.timeout(30000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(testFile));

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.strictEqual(info.dirtyChip, '', 'a clean document must not raise the chip');
    });

    /**
     * `collectDirtyStatus` on its own, through a symlink -- the exact shape of
     * the reported bug: the note reached through a link the agenda's own
     * `workspaceDir` does not use, opened and edited without being saved.
     */
    suite('collectDirtyStatus through a symlink', () => {
        let workDir: string;
        let realFile: string;
        let linkedFile: string;

        before(() => {
            workDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-org-dirty-')));
            realFile = path.join(workDir, 'real-notes.md');
            linkedFile = path.join(workDir, 'linked-notes.md');
            fs.writeFileSync(realFile, '## TODO Task\n');
            try {
                fs.symlinkSync(realFile, linkedFile);
            } catch {
                // Windows without the developer-mode privilege: fall back to the
                // real path, same as gitStatus.integration.test.ts does. What is
                // asserted below still holds, it just exercises no symlink.
                linkedFile = realFile;
            }
        });

        after(() => {
            fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        });

        test('a document opened by its real path is found under the linked path the agenda reports', async () => {
            const doc = await vscode.workspace.openTextDocument(realFile);
            const editor = await vscode.window.showTextDocument(doc);
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(0, 0), 'edited\n');
            });
            try {
                const status = await collectDirtyStatus([linkedFile]);
                assert.strictEqual(status.files.length, 1);
                assert.strictEqual(status.files[0]?.file, linkedFile);
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            }
        });

        test('a document that is not open, or not dirty, reports no files', async () => {
            const status = await collectDirtyStatus([linkedFile]);
            assert.deepStrictEqual(status.files, []);
        });
    });
});
