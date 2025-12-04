import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { AgendaPanel } from '../views/agendaPanel';

const outputChannel = vscode.window.createOutputChannel('Markdown Org');

export async function showAgenda(context: vscode.ExtensionContext, mode: 'day' | 'week' | 'tasks') {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const extractorPath = config.get<string>('extractorPath');
    const workspaceDir = config.get<string>('workspaceDir') || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    outputChannel.appendLine(`=== Agenda ${mode} ===`);
    outputChannel.appendLine(`Extractor: ${extractorPath}`);
    outputChannel.appendLine(`Workspace: ${workspaceDir}`);

    if (!extractorPath || !workspaceDir) {
        vscode.window.showErrorMessage('Configure markdown-org.extractorPath and workspace');
        return;
    }

    const args = ['--dir', workspaceDir, '--format', 'json'];
    if (mode === 'tasks') {
        args.push('--tasks');
    } else {
        args.push('--agenda', mode);
    }

    outputChannel.appendLine(`Command: ${extractorPath} ${args.join(' ')}`);

    try {
        const result = await execCommand(extractorPath, args);
        outputChannel.appendLine(`Output length: ${result.length}`);
        outputChannel.appendLine(`First 500 chars: ${result.substring(0, 500)}`);
        
        const data = JSON.parse(result);
        outputChannel.appendLine(`Parsed: ${Array.isArray(data) ? 'array' : typeof data}, length: ${data.length}`);
        outputChannel.appendLine(`First item: ${JSON.stringify(data[0], null, 2)}`);
        
        AgendaPanel.render(context, data, mode);
    } catch (error) {
        outputChannel.appendLine(`ERROR: ${error}`);
        outputChannel.show();
        vscode.window.showErrorMessage(`Failed to load agenda: ${error}`);
    }
}

function execCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        cp.execFile(command, args, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout);
            }
        });
    });
}
