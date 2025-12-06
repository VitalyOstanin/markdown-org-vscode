import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AgendaPanel } from '../views/agendaPanel';

export async function showAgenda(context: vscode.ExtensionContext, mode: 'day' | 'week' | 'month' | 'tasks', initialDate?: string) {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const extractorPath = config.get<string>('extractorPath');
    const workspaceDir = config.get<string>('workspaceDir') || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!extractorPath) {
        vscode.window.showErrorMessage('Markdown Org: Please configure markdown-org.extractorPath in settings');
        return;
    }

    // Validate extractor path
    if (!path.isAbsolute(extractorPath)) {
        // If relative path, check if it's in PATH by trying to execute
        try {
            cp.execSync(`which ${extractorPath}`, { stdio: 'pipe' });
        } catch {
            vscode.window.showErrorMessage(
                `Markdown Org: Extractor '${extractorPath}' not found in PATH. ` +
                'Please install markdown-org-extract: cargo install markdown-org-extract'
            );
            return;
        }
    } else {
        // If absolute path, check if file exists
        if (!fs.existsSync(extractorPath)) {
            vscode.window.showErrorMessage(
                `Markdown Org: Extractor not found at '${extractorPath}'. ` +
                'Please check markdown-org.extractorPath setting or install: cargo install markdown-org-extract'
            );
            return;
        }
    }

    if (!workspaceDir) {
        vscode.window.showErrorMessage('Markdown Org: Please open a workspace folder or configure markdown-org.workspaceDir');
        return;
    }

    let currentDate = initialDate;

    const loadData = async (date?: string, userInitiated: boolean = false) => {
        if (date !== undefined) {
            currentDate = date;
        }
        if (!currentDate) {
            const today = new Date();
            currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }

        const args = ['--dir', workspaceDir, '--format', 'json'];
        if (mode === 'tasks') {
            args.push('--tasks');
        } else {
            args.push('--agenda', mode);
            args.push('--date', currentDate);
        }

        try {
            const result = await execCommand(extractorPath, args);
            const data = JSON.parse(result);
            AgendaPanel.render(context, data, mode, currentDate, loadData, userInitiated);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to load agenda: ${errorMsg}`);
        }
    };

    await loadData(undefined, true);
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
