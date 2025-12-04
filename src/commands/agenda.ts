import * as vscode from 'vscode';
import * as cp from 'child_process';
import { AgendaPanel } from '../views/agendaPanel';

export async function showAgenda(context: vscode.ExtensionContext, mode: 'day' | 'week' | 'tasks') {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const extractorPath = config.get<string>('extractorPath');
    const workspaceDir = config.get<string>('workspaceDir') || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!extractorPath) {
        vscode.window.showErrorMessage('Markdown Org: Please configure markdown-org.extractorPath in settings');
        return;
    }

    if (!workspaceDir) {
        vscode.window.showErrorMessage('Markdown Org: Please open a workspace folder or configure markdown-org.workspaceDir');
        return;
    }

    const loadData = async () => {
        const args = ['--dir', workspaceDir, '--format', 'json'];
        if (mode === 'tasks') {
            args.push('--tasks');
        } else {
            args.push('--agenda', mode);
        }

        try {
            const result = await execCommand(extractorPath, args);
            const data = JSON.parse(result);
            AgendaPanel.render(context, data, mode, loadData);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to load agenda: ${errorMsg}`);
        }
    };

    await loadData();
}

function execCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Command timeout after 30 seconds'));
        }, 30000);

        cp.execFile(command, args, (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout);
            }
        });
    });
}
