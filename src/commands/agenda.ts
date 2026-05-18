import * as vscode from 'vscode';
import { AgendaPanel } from '../views/agendaPanel';
import { FileTag } from '../types';
import { toIsoDate } from '../utils';
import { exec } from '../utils/exec';
import { filterTasksByTag } from '../utils/tagFilter';
import { EXTRACTOR_MAX_BUFFER_BYTES, EXTRACTOR_TIMEOUT_MS, extractor } from '../utils/extractor';
import { notifyError, notifyInfo, notifyWarn } from '../utils/notify';

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
    const holidaysCache = new Map<number, string[]>();

    const getHolidays = async (year: number): Promise<string[]> => {
        const cached = holidaysCache.get(year);
        if (cached) {
            return cached;
        }
        try {
            const result = await execCommand(extractorPath, ['--holidays', year.toString()]);
            const parsed: string[] = JSON.parse(result);
            holidaysCache.set(year, parsed);
            return parsed;
        } catch {
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
            const errorMsg = error instanceof Error ? error.message : String(error);
            notifyError(`Failed to load agenda: ${errorMsg}`);
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

    const currentIndex = fileTags.findIndex((t) => t.name === currentTag);
    const nextIndex = (currentIndex + 1) % fileTags.length;
    const nextTag = fileTags[nextIndex].name;

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
                    reject(new Error(stderr || error.message || 'Unknown error'));
                } else {
                    resolve(stdout);
                }
            }
        );
    });
}
