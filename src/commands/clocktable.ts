import * as vscode from 'vscode';
import { formatDurationHM, requireActiveEditor } from '../utils';
import { formatError, notifyError, notifyWarn } from '../utils/notify';
import { parseClockEntries, type ClockTableRow } from '../utils/parseClockEntries';

function formatDuration(minutes: number): string {
    return formatDurationHM(minutes * 60_000);
}

export function buildClockTable(rows: ClockTableRow[]): string {
    if (rows.length === 0) {
        return '| Heading | Time |\n|---------|------|\n| No CLOCK entries found | 0:00 |';
    }

    const headingStrs = rows.map((r) => r.title);
    const timeStrs = rows.map((r) => formatDuration(r.totalMinutes));
    const totalMinutes = rows.reduce((sum, r) => sum + r.totalMinutes, 0);
    const totalStr = formatDuration(totalMinutes);

    const maxHeadingLen = Math.max('Heading'.length, '**Total**'.length, ...headingStrs.map((s) => s.length));
    const maxTimeLen = Math.max('Time'.length, ...timeStrs.map((s) => s.length), totalStr.length);

    const lines: string[] = [];
    lines.push(`| ${'Heading'.padEnd(maxHeadingLen)} | ${'Time'.padEnd(maxTimeLen)} |`);
    lines.push(`|${'-'.repeat(maxHeadingLen + 2)}|${'-'.repeat(maxTimeLen + 2)}|`);

    for (let i = 0; i < headingStrs.length; i++) {
        lines.push(`| ${headingStrs[i].padEnd(maxHeadingLen)} | ${timeStrs[i].padEnd(maxTimeLen)} |`);
    }

    lines.push(`|${'-'.repeat(maxHeadingLen + 2)}|${'-'.repeat(maxTimeLen + 2)}|`);
    lines.push(`| ${'**Total**'.padEnd(maxHeadingLen)} | **${totalStr}**${' '.repeat(maxTimeLen - totalStr.length)} |`);

    return lines.join('\n');
}

/**
 * Insert a CLOCK summary table for the current file at the cursor position.
 * Parses the document directly (no extractor dependency) so DONE and plain
 * headings with CLOCK history are included alongside TODO ones, matching
 * Org-mode clocktable semantics for `:scope file`.
 *
 * Disabled in untrusted workspaces because the command modifies file
 * contents.
 */
export async function insertClockTable() {
    if (!vscode.workspace.isTrusted) {
        notifyWarn('clock table is disabled in untrusted workspaces');
        return;
    }
    const editor = requireActiveEditor();
    if (!editor) {
        return;
    }

    try {
        const rows = parseClockEntries(editor.document.getText());
        const table = buildClockTable(rows);

        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, table + '\n');
        });
    } catch (error) {
        notifyError(`Failed to generate clock table: ${formatError(error)}`);
    }
}
