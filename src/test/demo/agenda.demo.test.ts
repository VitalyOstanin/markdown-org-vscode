import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { suite, test } from 'mocha';
import {
    sleep,
    markDemoStart,
    hideSidePanels,
    enableScreencast,
    forceEnglishWeekdays,
    applyDemoTheme,
    maximizeVscodeWindow,
    runCommandViaPalette,
    initDemoRepository,
    commitInDemoRepository
} from './_helpers';

/**
 * The agenda relies on the external `markdown-org-extract` binary to parse
 * workspace files into per-day buckets. We seed the workspace with markdown
 * containing SCHEDULED / DEADLINE timestamps spread across today and the
 * upcoming days, then open Day / Week / Month views in turn.
 */
suite('Demo: Agenda', () => {
    test('Day / Week / Month views', async function () {
        // Four palette invocations at about four seconds each.
        this.timeout(150000);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('demo expects a workspace folder');
        }

        const wsDir = workspaceFolder.uri.fsPath;
        const today = new Date();
        const iso = (offsetDays: number): string => {
            const d = new Date(today);
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().slice(0, 10);
        };

        const planningFile = path.join(wsDir, 'planning.md');
        await fs.writeFile(
            planningFile,
            '# Sprint Plan\n' +
                '\n' +
                `## TODO Review pull requests\n` +
                `\`SCHEDULED: <${iso(0)} 10:00>\`\n` +
                '\n' +
                `## TODO Pairing session\n` +
                `\`SCHEDULED: <${iso(1)} 14:00>\`\n` +
                '\n' +
                `## TODO Architecture sync\n` +
                `\`SCHEDULED: <${iso(2)}>\`\n` +
                '\n' +
                `## TODO Quarterly demo\n` +
                `\`DEADLINE: <${iso(6)}>\`\n`,
            'utf-8'
        );

        const personalFile = path.join(wsDir, 'personal.md');
        await fs.writeFile(
            personalFile,
            '# Personal\n' +
                '\n' +
                `## TODO Dentist visit\n` +
                `\`SCHEDULED: <${iso(3)} 09:30>\`\n` +
                '\n' +
                `## TODO Pay utility bills\n` +
                `\`DEADLINE: <${iso(5)}>\`\n`,
            'utf-8'
        );

        // The header's git chip reports on the files behind the view, so the
        // workspace gets a repository with something to report: personal.md
        // committed but not pushed, planning.md edited and not committed.
        await initDemoRepository(wsDir);
        await fs.appendFile(personalFile, `\n## TODO Gym session\n\`SCHEDULED: <${iso(0)} 18:00>\`\n`, 'utf-8');
        await commitInDemoRepository(wsDir, ['personal.md'], 'notes: block out the evening session');
        // No timestamp on this one: it moves the chip, not the agenda.
        await fs.appendFile(planningFile, '\n## TODO Draft the retrospective agenda\n', 'utf-8');

        // Point the extension at this workspace explicitly.
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', wsDir, vscode.ConfigurationTarget.Workspace);

        const document = await vscode.workspace.openTextDocument(planningFile);
        await vscode.window.showTextDocument(document);

        await applyDemoTheme();
        await hideSidePanels();
        await forceEnglishWeekdays();
        await sleep(800);
        await maximizeVscodeWindow();
        await sleep(1500);
        await vscode.commands.executeCommand('notifications.clearAll');
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await enableScreencast();
        await sleep(1000);
        await maximizeVscodeWindow();
        await sleep(500);
        await markDemoStart();
        await sleep(500);

        // Every view is opened through the Command Palette, so the recording
        // names the command instead of showing a chord the viewer may not
        // have. The agenda panel grabs focus as it opens; the palette helper
        // re-activates the VS Code window on each call.
        await runCommandViaPalette('Markdown Org Show Agenda Day');
        await sleep(2500);

        await runCommandViaPalette('Markdown Org Show Agenda Week');
        await sleep(2800);

        await runCommandViaPalette('Markdown Org Show Agenda Month');
        await sleep(3200);

        await runCommandViaPalette('Markdown Org Show Tasks');
        await sleep(2500);
    });
});
