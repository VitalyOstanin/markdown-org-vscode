import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { suite, before, beforeEach, afterEach, after, test } from 'mocha';
import { exec } from '../../utils/exec';
import { extractor } from '../../utils/extractor';
import { AgendaPanel } from '../../views/agendaPanel';
import { waitForAgendaRender, waitUntil } from './_helpers';
import { makeExtractorFake } from '../_execFake';

suite('Agenda Style Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-style.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    const sparseWeek = [
        { date: '2025-12-08', scheduled_timed: [] },
        { date: '2025-12-09', scheduled_no_time: [] }
    ];

    before(() => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        fs.writeFileSync(testFile, '## TODO Task\n');
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');

        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(makeExtractorFake({ day: [], week: sparseWeek, month: [], tasks: [] }));

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

    // The agenda has a single visual style, so the body carries no style
    // selector at all -- the old per-style setting, its cycle command and the
    // `data-agenda-style` hook were all removed.
    test('the webview body carries no agenda-style selector', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek', '2025-12-09');
        await waitForAgendaRender('week');

        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaWeek');
        assert.ok(
            !panel.webview.html.includes('data-agenda-style'),
            'the single-style agenda must not emit a data-agenda-style hook'
        );
        // The task grid is still styled -- the rules simply are not scoped now.
        assert.ok(panel.webview.html.includes('.task-line {'), 'expected the task-line rules in the webview');
    });

    // markdown-org.agendaFontFamily lands inside the nonce'd <style> block, so
    // the panel validates it (sanitizeFontFamily, unit-tested) instead of
    // interpolating whatever the settings file holds.
    test('a font-family value carrying CSS syntax never reaches the stylesheet', async function () {
        this.timeout(10000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update(
            'agendaFontFamily',
            'sans-serif; } body { display: none; } .x {',
            vscode.ConfigurationTarget.Workspace
        );
        try {
            await vscode.commands.executeCommand('markdown-org.showAgendaWeek', '2025-12-09');
            await waitForAgendaRender('week');

            const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
            assert.ok(panel, 'expected AgendaPanel to be open after showAgendaWeek');
            assert.ok(
                !panel.webview.html.includes('body { display: none; }'),
                'the injected rule must not appear in the webview stylesheet'
            );
            assert.ok(
                panel.webview.html.includes("--markdown-org-agenda-font: 'Adwaita Sans'"),
                'a rejected value must fall back to the default font stack'
            );
        } finally {
            await config.update('agendaFontFamily', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    test('changing the font family re-renders the open panel without reopening it', async function () {
        this.timeout(10000);
        const config = vscode.workspace.getConfiguration('markdown-org');
        await vscode.commands.executeCommand('markdown-org.showAgendaWeek', '2025-12-09');
        await waitForAgendaRender('week');

        const panel = (AgendaPanel as unknown as { currentPanel?: { webview: vscode.Webview } }).currentPanel;
        assert.ok(panel, 'expected AgendaPanel to be open after showAgendaWeek');
        assert.ok(panel.webview.html.includes("--markdown-org-agenda-font: 'Adwaita Sans'"));

        try {
            await config.update('agendaFontFamily', 'Fira Sans, sans-serif', vscode.ConfigurationTarget.Workspace);
            // Wait on the condition rather than on a fixed pause: the rebuild
            // runs from the configuration-change event, not from this await.
            await waitUntil(
                () => panel.webview.html.includes('font: Fira Sans, sans-serif'),
                'the rebuilt shell to carry the new font stack',
                3000
            );
            assert.ok(
                panel.webview.html.includes('--markdown-org-agenda-font: Fira Sans, sans-serif'),
                `expected the new font stack in the rebuilt shell, got: ${
                    /--markdown-org-agenda-font:[^;]*/.exec(panel.webview.html)?.[0]
                }`
            );
        } finally {
            await config.update('agendaFontFamily', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });
});

// The table style adds a per-task type-flag column. `renderTask` emits a
// `<span class="flag" data-flag="...">` for every task, where the value is
// computed by `resolveTaskFlag` (precedence: cancelled > deadline > repeat >
// scheduled-with-time > none). These tests drive a day payload whose tasks
// exercise each branch and read the rendered `data-flag` values back out of
// the webview DOM via `queryRenderedInfoForTesting().flags`.
suite('Agenda Table Flags Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'agenda-table-flags.md');

    let execFileStub: sinon.SinonStub;
    let resolveExtractorStub: sinon.SinonStub;
    let showErrorStub: sinon.SinonStub;

    const baseTask = { file: testFile, line: 1, content: '' };

    // One task per flag branch. Buckets do not affect flag computation --
    // resolveTaskFlag reads task_type / timestamp_type / timestamp_repeater /
    // timestamp_time only -- so they are spread across the day's buckets.
    const flagDay = {
        date: '2025-12-09',
        overdue: [],
        scheduled_timed: [
            // repeat: has a repeater (wins over the bare time it also carries)
            {
                ...baseTask,
                heading: 'Repeating',
                task_type: 'TODO',
                timestamp_time: '09:00',
                timestamp_repeater: '+1w'
            },
            // deadline: DEADLINE timestamp
            { ...baseTask, heading: 'Due', task_type: 'TODO', timestamp_type: 'DEADLINE' },
            // cancelled: wins over everything else
            {
                ...baseTask,
                heading: 'Dropped',
                task_type: 'CANCELLED',
                timestamp_type: 'DEADLINE',
                timestamp_time: '10:00',
                timestamp_repeater: '+1d'
            },
            // scheduled: has a time, no repeater, not a deadline
            { ...baseTask, heading: 'Timed', task_type: 'TODO', timestamp_time: '11:00' }
        ],
        scheduled_no_time: [
            // none: plain scheduled TODO, neither time nor repeater
            { ...baseTask, heading: 'Plain', task_type: 'TODO' }
        ],
        upcoming: []
    };

    before(() => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        fs.writeFileSync(testFile, '## TODO Task\n');
    });

    beforeEach(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);
        await config.update('currentTag', 'ALL', vscode.ConfigurationTarget.Workspace);

        resolveExtractorStub = sinon.stub(extractor, 'resolveExtractorPath').resolves('markdown-org-extract');

        execFileStub = sinon.stub(exec, 'execFile');
        execFileStub.callsFake(makeExtractorFake({ day: [flagDay], week: [], month: [], tasks: [] }));

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

    test('table style renders a data-flag per task matching resolveTaskFlag precedence', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay', '2025-12-09');
        await waitForAgendaRender('day');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info, 'expected AgendaPanel to be open after showAgendaDay');

        // Task-to-flag matching by array position is fragile (bucket order and
        // in-bucket order are rendering details), so compare the multiset of
        // rendered flags against the expected multiset.
        const sortedForCompare = (xs: string[]) => [...xs].sort();
        assert.deepStrictEqual(
            sortedForCompare(info.flags),
            sortedForCompare(['repeat', 'deadline', 'cancelled', 'scheduled', '']),
            `unexpected rendered data-flag values: ${JSON.stringify(info.flags)}`
        );
    });
});
