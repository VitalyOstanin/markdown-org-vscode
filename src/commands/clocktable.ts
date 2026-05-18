import * as vscode from 'vscode';
import * as path from 'path';
import { formatDurationHM, requireActiveEditor } from '../utils';
import { exec } from '../utils/exec';
import { EXTRACTOR_MAX_BUFFER_BYTES, EXTRACTOR_TIMEOUT_MS, extractor } from '../utils/extractor';

interface Task {
    heading: string;
    clocks?: Array<{ duration?: string }>;
    total_clock_time?: string;
}

function parseClockData(extractorPath: string, filePath: string): Promise<Task[]> {
    return new Promise((resolve, reject) => {
        exec.execFile(
            extractorPath,
            ['--dir', path.dirname(filePath), '--glob', path.basename(filePath), '--format', 'json', '--tasks'],
            {
                encoding: 'utf-8',
                maxBuffer: EXTRACTOR_MAX_BUFFER_BYTES,
                timeout: EXTRACTOR_TIMEOUT_MS
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message || `markdown-org-extract failed`));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch (parseError) {
                    reject(parseError);
                }
            }
        );
    });
}

function formatDuration(minutes: number): string {
    return formatDurationHM(minutes * 60_000);
}

function parseDuration(duration: string): number {
    const [hours, mins] = duration.split(':').map((s) => parseInt(s, 10));
    return hours * 60 + mins;
}

function buildClockTable(tasks: Task[]): string {
    const tasksWithTime = tasks.filter((t) => t.total_clock_time);

    if (tasksWithTime.length === 0) {
        return '| Heading | Time |\n|---------|------|\n| No CLOCK entries found | 0:00 |';
    }

    const rows = tasksWithTime.map((t) => ({
        heading: t.heading.replace(/^(TODO|DONE)\s+(\[#[A-Z]\]\s+)?/, ''),
        time: t.total_clock_time!
    }));

    const totalMinutes = tasksWithTime.reduce((sum, t) => sum + parseDuration(t.total_clock_time!), 0);

    const maxHeadingLen = Math.max(7, ...rows.map((r) => r.heading.length));
    const maxTimeLen = Math.max(4, ...rows.map((r) => r.time.length), formatDuration(totalMinutes).length);

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

/**
 * Insert a CLOCK summary table for the current file at the cursor position.
 * Runs markdown-org-extract over the file to aggregate clocks per heading.
 * Disabled in untrusted workspaces.
 */
export async function insertClockTable() {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage('Markdown Org: clock table is disabled in untrusted workspaces');
        return;
    }
    const editor = requireActiveEditor();
    if (!editor) {
        return;
    }

    const extractorPath = await extractor.resolveExtractorPath();
    if (!extractorPath) {
        return;
    }

    const filePath = editor.document.uri.fsPath;

    try {
        const tasks = await parseClockData(extractorPath, filePath);
        const table = buildClockTable(tasks);

        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, table + '\n');
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate clock table: ${error}`);
    }
}
