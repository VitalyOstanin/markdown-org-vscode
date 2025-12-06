import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AgendaPanel } from '../views/agendaPanel';

function filterTasksByTag(data: any, tag: string, fileTags: any[]): any {
    if (tag === 'ALL') {
        return data;
    }

    const tagConfig = fileTags.find(t => t.name === tag);
    if (!tagConfig) {
        return data;
    }

    const pattern = tagConfig.pattern || '';
    const filterFn = (task: any) => {
        if (!pattern) {
            return !fileTags.some(t => t.pattern && !t.pattern.startsWith('!') && task.file.includes(t.pattern));
        }
        if (pattern.startsWith('!')) {
            return !task.file.includes(pattern.slice(1));
        }
        return task.file.includes(pattern);
    };

    if (Array.isArray(data)) {
        if (data.length > 0 && 'date' in data[0]) {
            return data.map(day => ({
                ...day,
                overdue: (day.overdue || []).filter(filterFn),
                scheduled_timed: (day.scheduled_timed || []).filter(filterFn),
                scheduled_no_time: (day.scheduled_no_time || []).filter(filterFn),
                upcoming: (day.upcoming || []).filter(filterFn)
            }));
        }
        return data.filter(filterFn);
    }
    return data;
}

export async function showAgenda(context: vscode.ExtensionContext, mode: 'day' | 'week' | 'month' | 'tasks', initialDate?: string) {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const extractorPath = config.get<string>('extractorPath');
    const workspaceDir = config.get<string>('workspaceDir') || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!extractorPath) {
        vscode.window.showErrorMessage('Markdown Org: Please configure markdown-org.extractorPath in settings');
        return;
    }

    if (!path.isAbsolute(extractorPath)) {
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

    const getHolidays = async (year: number): Promise<string[]> => {
        try {
            const result = await execCommand(extractorPath, ['--holidays', year.toString()]);
            return JSON.parse(result);
        } catch {
            return [];
        }
    };

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
            const rawData = JSON.parse(result);
            const config = vscode.workspace.getConfiguration('markdown-org');
            const currentTag = config.get<string>('currentTag', 'ALL');
            const fileTags = config.get<any[]>('fileTags', []);
            const data = filterTasksByTag(rawData, currentTag, fileTags);
            
            const year = currentDate ? parseInt(currentDate.split('-')[0]) : new Date().getFullYear();
            const holidays = await getHolidays(year);
            
            AgendaPanel.render(context, data, mode, currentDate, loadData, userInitiated, currentTag, holidays);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to load agenda: ${errorMsg}`);
        }
    };

    await loadData(undefined, true);
}

export async function cycleTag(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const fileTags = config.get<any[]>('fileTags', []);
    const currentTag = config.get<string>('currentTag', 'ALL');
    
    const currentIndex = fileTags.findIndex(t => t.name === currentTag);
    const nextIndex = (currentIndex + 1) % fileTags.length;
    const nextTag = fileTags[nextIndex].name;
    
    await config.update('currentTag', nextTag, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Tag filter: ${nextTag}`);
    
    AgendaPanel.refreshWithCurrentTag();
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
