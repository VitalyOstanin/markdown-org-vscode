import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as sinon from 'sinon';
import type * as cp from 'child_process';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';

suite('CLOCK Table Integration Tests', () => {
    let testFilePath: string;
    let testDocument: vscode.TextDocument;
    let editor: vscode.TextEditor;
    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;

    type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
    function makeExecFileFake(stdout: string, stderr: string, code: number) {
        return (..._args: unknown[]) => {
            const callback = _args[_args.length - 1] as ExecFileCallback;
            const error = code === 0 ? null : Object.assign(new Error(stderr || `exit ${code}`), { code });
            queueMicrotask(() => callback(error, stdout, stderr));
            return {} as unknown as cp.ChildProcess;
        };
    }

    const mockDataWithClocks = [
        {
            file: '/test/sample.md',
            line: 1,
            heading: 'Task 1',
            content: '',
            task_type: 'TODO',
            clocks: [{ start: '2025-12-09 Mon 10:00', end: '2025-12-09 Mon 12:30', duration: '2:30' }],
            total_clock_time: '2:30'
        },
        {
            file: '/test/sample.md',
            line: 4,
            heading: 'Task 2',
            content: '',
            task_type: 'TODO',
            clocks: [{ start: '2025-12-09 Mon 14:00', end: '2025-12-09 Mon 15:45', duration: '1:45' }],
            total_clock_time: '1:45'
        }
    ];

    const mockDataWithoutClocks = [
        {
            file: '/test/sample.md',
            line: 1,
            heading: 'Task without clocks',
            content: 'Some content',
            task_type: 'TODO'
        }
    ];

    setup(async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        testFilePath = path.join(workspaceFolder.uri.fsPath, 'test-clocktable.md');

        const initialContent = `## TODO Task 1
\`CLOCK: <2025-12-09 Mon 10:00>--<2025-12-09 Mon 12:30> => 2:30\`

## TODO Task 2
\`CLOCK: <2025-12-09 Mon 14:00>--<2025-12-09 Mon 15:45> => 1:45\`
`;

        fs.writeFileSync(testFilePath, initialContent, 'utf8');

        testDocument = await vscode.workspace.openTextDocument(testFilePath);
        editor = await vscode.window.showTextDocument(testDocument);

        execFileStub = sinon.stub(exec, 'execFile');
        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');
    });

    teardown(async () => {
        execFileStub.restore();
        resolveExtractorStub.restore();

        if (testDocument) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }

        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    test('Insert clock table with tasks', async function () {
        this.timeout(5000);

        execFileStub.callsFake(makeExecFileFake(JSON.stringify(mockDataWithClocks), '', 0));

        const position = new vscode.Position(6, 0);
        editor.selection = new vscode.Selection(position, position);

        await vscode.commands.executeCommand('markdown-org.insertClockTable');
        await new Promise((resolve) => setTimeout(resolve, 100));

        const text = editor.document.getText();

        assert.ok(text.includes('| Heading'), 'Should contain table header');
        assert.ok(text.includes('| Time'), 'Should contain Time column');
        assert.ok(text.includes('| Task 1'), 'Should contain Task 1');
        assert.ok(text.includes('| Task 2'), 'Should contain Task 2');
        assert.ok(text.includes('| 2:30'), 'Should contain Task 1 time');
        assert.ok(text.includes('| 1:45'), 'Should contain Task 2 time');
        assert.ok(text.includes('**Total**'), 'Should contain total row');
        assert.ok(text.includes('**4:15**'), 'Should contain total time 4:15');
    });

    test('Insert clock table with no CLOCK entries', async function () {
        this.timeout(5000);

        execFileStub.callsFake(makeExecFileFake(JSON.stringify(mockDataWithoutClocks), '', 0));

        const emptyContent = `## TODO Task without clocks
Some content here
`;
        await editor.edit((editBuilder) => {
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            editBuilder.replace(fullRange, emptyContent);
        });

        const position = new vscode.Position(3, 0);
        editor.selection = new vscode.Selection(position, position);

        await vscode.commands.executeCommand('markdown-org.insertClockTable');
        await new Promise((resolve) => setTimeout(resolve, 100));

        const text = editor.document.getText();
        assert.ok(
            text.includes('No CLOCK entries') || text.includes('0:00'),
            'Should show no entries message or zero time'
        );
    });

    test('Handle extractor error', async function () {
        this.timeout(5000);

        execFileStub.callsFake(makeExecFileFake('', 'Extractor error', 1));

        const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');

        const position = new vscode.Position(6, 0);
        editor.selection = new vscode.Selection(position, position);

        await vscode.commands.executeCommand('markdown-org.insertClockTable');
        await new Promise((resolve) => setTimeout(resolve, 100));

        assert.ok(showErrorStub.called, 'Should show error message');
        showErrorStub.restore();
    });
});
