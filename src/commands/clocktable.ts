import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

const EXTRACTOR_TIMEOUT_MS = 30_000;
const EXTRACTOR_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

interface Task {
    heading: string;
    clocks?: Array<{ duration?: string }>;
    total_clock_time?: string;
}

function getExtractorPath(): string {
    const config = vscode.workspace.getConfiguration('markdown-org');
    return config.get<string>('extractorPath') || 'markdown-org-extract';
}

function parseClockData(filePath: string): Promise<Task[]> {
    const extractorPath = getExtractorPath();
    return new Promise((resolve, reject) => {
        cp.execFile(extractorPath, [
            '--dir', path.dirname(filePath),
            '--glob', path.basename(filePath),
            '--format', 'json',
            '--tasks'
        ], {
            encoding: 'utf-8',
            maxBuffer: EXTRACTOR_MAX_BUFFER_BYTES,
            timeout: EXTRACTOR_TIMEOUT_MS
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message || `markdown-org-extract failed`));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
}

function parseDuration(duration: string): number {
    const [hours, mins] = duration.split(':').map(s => parseInt(s, 10));
    return hours * 60 + mins;
}

function buildClockTable(tasks: Task[]): string {
    const tasksWithTime = tasks.filter(t => t.total_clock_time);
    
    if (tasksWithTime.length === 0) {
        return '| Heading | Time |\n|---------|------|\n| No CLOCK entries found | 0:00 |';
    }

    const rows = tasksWithTime.map(t => ({
        heading: t.heading.replace(/^(TODO|DONE)\s+(\[#[A-Z]\]\s+)?/, ''),
        time: t.total_clock_time!
    }));

    const totalMinutes = tasksWithTime.reduce((sum, t) => 
        sum + parseDuration(t.total_clock_time!), 0);

    const maxHeadingLen = Math.max(7, ...rows.map(r => r.heading.length));
    const maxTimeLen = Math.max(4, ...rows.map(r => r.time.length), formatDuration(totalMinutes).length);

    const lines: string[] = [];
    lines.push(`| ${'Heading'.padEnd(maxHeadingLen)} | ${'Time'.padEnd(maxTimeLen)} |`);
    lines.push(`|${'-'.repeat(maxHeadingLen + 2)}|${'-'.repeat(maxTimeLen + 2)}|`);
    
    for (const row of rows) {
        lines.push(`| ${row.heading.padEnd(maxHeadingLen)} | ${row.time.padEnd(maxTimeLen)} |`);
    }
    
    lines.push(`|${'-'.repeat(maxHeadingLen + 2)}|${'-'.repeat(maxTimeLen + 2)}|`);
    const totalStr = formatDuration(totalMinutes);
    lines.push(`| ${'**Total**'.padEnd(maxHeadingLen)} | **${totalStr}**${' '.repeat(maxTimeLen - totalStr.length)} |`);

    return lines.join('\n');
}

export async function insertClockTable() {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage('Markdown Org: clock table is disabled in untrusted workspaces');
        return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const filePath = editor.document.uri.fsPath;
    
    try {
        const tasks = await parseClockData(filePath);
        const table = buildClockTable(tasks);
        
        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, table + '\n');
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate clock table: ${error}`);
    }
}
