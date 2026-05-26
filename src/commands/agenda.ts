import * as vscode from 'vscode';
import { AgendaPanel } from '../views/agendaPanel';
import { FileTag } from '../types';
import { toIsoDate } from '../utils';
import { exec } from '../utils/exec';
import { filterTasksByTag } from '../utils/tagFilter';
import { EXTRACTOR_MAX_BUFFER_BYTES, EXTRACTOR_TIMEOUT_MS, extractor } from '../utils/extractor';
import { formatError, notifyError, notifyInfo, notifyWarn } from '../utils/notify';
import { buildTagCycle, computeNextTag } from '../utils/cycleTag';
import { buildExecError } from '../utils/execError';
import { getCachedHolidays } from '../utils/holidaysCache';

/**
 * Open the agenda webview for the given mode (day/week/month/tasks).
 * Validates the extractor path, then loads data via the extractor process.
 * Disabled in untrusted workspaces.
 */
export async function showAgenda(
    context: vscode.ExtensionContext,
    mode: 'day' | 'week' | 'month' | 'tasks',
    initialDate?: string
) {
    if (!vscode.workspace.isTrusted) {
        notifyWarn('agenda is disabled in untrusted workspaces');
        return;
    }

    const extractorPath = await extractor.resolveExtractorPath();
    if (!extractorPath) {
        return;
    }

    const startupConfig = vscode.workspace.getConfiguration('markdown-org');
    const workspaceDir =
        startupConfig.get<string>('workspaceDir') || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceDir) {
        notifyError('Please open a workspace folder or configure markdown-org.workspaceDir');
        return;
    }

    let shiftedToday = initialDate;

    const getHolidays = async (year: number): Promise<string[]> => {
        try {
            return await getCachedHolidays(year, async (y) => {
                const result = await execCommand(extractorPath, ['--holidays', y.toString()]);
                return JSON.parse(result) as string[];
            });
        } catch {
            // Graceful degradation: missing/older extractor binaries do not
            // expose --holidays. The agenda must still render, so we silently
            // fall back to "no holidays" rather than surfacing an error every
            // time the panel refreshes. The cache itself does not memoise
            // failures, so the next agenda open will retry the extractor.
            return [];
        }
    };

    const loadData = async (newShiftedToday?: string, userInitiated: boolean = false) => {
        // `newShiftedToday` is set when the user clicked Prev/Next/Today
        // inside the webview (refreshCallback(message.date, true)) — that's
        // an explicit jump. When it's undefined, this is the initial open
        // or a repeated Show Agenda command, which should keep scroll.
        const navigation = newShiftedToday !== undefined;
        if (newShiftedToday !== undefined) {
            shiftedToday = newShiftedToday;
        }
        if (!shiftedToday) {
            shiftedToday = toIsoDate(new Date());
        }

        const args = ['--dir', workspaceDir, '--format', 'json', '--absolute-paths'];
        if (mode === 'tasks') {
            args.push('--tasks');
        } else {
            args.push('--agenda', mode);
            args.push('--date', shiftedToday);
        }

        try {
            const result = await execCommand(extractorPath, args);
            const rawData = JSON.parse(result);
            const config = vscode.workspace.getConfiguration('markdown-org');
            const currentTag = config.get<string>('currentTag', 'ALL');
            const fileTags = config.get<FileTag[]>('fileTags', []);
            const data = filterTasksByTag(rawData, currentTag, fileTags);

            const year = shiftedToday ? parseInt(shiftedToday.split('-')[0], 10) : new Date().getFullYear();
            const holidays = await getHolidays(year);

            AgendaPanel.render(
                context,
                data,
                mode,
                shiftedToday,
                loadData,
                userInitiated,
                currentTag,
                holidays,
                navigation
            );
        } catch (error) {
            notifyError(`Failed to load agenda: ${formatError(error)}`);
        }
    };

    await loadData(undefined, true);
}

/** Advance the file-tag filter (`markdown-org.currentTag`) to the next entry in `markdown-org.fileTags`. */
export async function cycleTag(_context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const fileTags = config.get<FileTag[]>('fileTags', []);
    const currentTag = config.get<string>('currentTag', 'ALL');

    if (fileTags.length === 0) {
        notifyWarn('No file tags configured (markdown-org.fileTags)');
        return;
    }

    const tagNames = fileTags.map((t) => t.name);

    // A cycle of just [ALL] means there is nothing to rotate to -- every
    // configured entry is named "ALL". Warn instead of silently staying on ALL.
    if (buildTagCycle(tagNames).length <= 1) {
        notifyWarn('Only "ALL" is configured in markdown-org.fileTags; nothing to cycle to');
        return;
    }

    const nextTag = computeNextTag(currentTag, tagNames);

    const target =
        (vscode.workspace.workspaceFolders?.length ?? 0) > 0
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
    await config.update('currentTag', nextTag, target);
    notifyInfo(`Tag filter: ${nextTag}`);

    AgendaPanel.refresh();
}

function execCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Command timeout after ${EXTRACTOR_TIMEOUT_MS / 1000} seconds`));
        }, EXTRACTOR_TIMEOUT_MS);

        exec.execFile(
            command,
            args,
            { encoding: 'utf-8', maxBuffer: EXTRACTOR_MAX_BUFFER_BYTES },
            (error, stdout, stderr) => {
                clearTimeout(timeout);
                if (error) {
                    reject(buildExecError(error, stderr, 'Unknown error'));
                } else {
                    resolve(stdout);
                }
            }
        );
    });
}
