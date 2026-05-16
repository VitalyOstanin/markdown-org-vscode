import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AgendaPanel } from '../views/agendaPanel';
import { FileTag } from '../types';
import { toIsoDate } from '../utils';
import { filterTasksByTag } from '../utils/tagFilter';

const EXTRACTOR_TIMEOUT_MS = 30_000;
const WHICH_TIMEOUT_MS = 5_000;

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
        vscode.window.showWarningMessage('Markdown Org: agenda is disabled in untrusted workspaces');
        return;
    }

    const startupConfig = vscode.workspace.getConfiguration('markdown-org');
    const extractorPath = startupConfig.get<string>('extractorPath');
    const workspaceDir =
        startupConfig.get<string>('workspaceDir') || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!extractorPath) {
        vscode.window.showErrorMessage('Markdown Org: Please configure markdown-org.extractorPath in settings');
        return;
    }

    if (!path.isAbsolute(extractorPath)) {
        const whichBin = process.platform === 'win32' ? 'where' : 'which';
        try {
            await new Promise<void>((resolve, reject) => {
                cp.execFile(whichBin, [extractorPath], { timeout: WHICH_TIMEOUT_MS }, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
        } catch {
            vscode.window.showErrorMessage(
                `Markdown Org: Extractor '${extractorPath}' not found in PATH. ` +
                    'Please install markdown-org-extract: cargo install markdown-org-extract'
            );
            return;
        }
    } else {
        try {
            await fs.promises.access(extractorPath, fs.constants.X_OK);
        } catch {
            vscode.window.showErrorMessage(
                `Markdown Org: Extractor not found or not executable at '${extractorPath}'. ` +
                    'Please check markdown-org.extractorPath setting or install: cargo install markdown-org-extract'
            );
            return;
        }
    }

    if (!workspaceDir) {
        vscode.window.showErrorMessage(
            'Markdown Org: Please open a workspace folder or configure markdown-org.workspaceDir'
        );
        return;
    }

    let currentDate = initialDate;
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

    const loadData = async (date?: string, userInitiated: boolean = false) => {
        if (date !== undefined) {
            currentDate = date;
        }
        if (!currentDate) {
            currentDate = toIsoDate(new Date());
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
            const fileTags = config.get<FileTag[]>('fileTags', []);
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

/** Advance the file-tag filter (`markdown-org.currentTag`) to the next entry in `markdown-org.fileTags`. */
export async function cycleTag(_context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const fileTags = config.get<FileTag[]>('fileTags', []);
    const currentTag = config.get<string>('currentTag', 'ALL');

    if (fileTags.length === 0) {
        vscode.window.showWarningMessage('Markdown Org: No file tags configured (markdown-org.fileTags)');
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
    vscode.window.showInformationMessage(`Tag filter: ${nextTag}`);

    AgendaPanel.refresh();
}

function execCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Command timeout after ${EXTRACTOR_TIMEOUT_MS / 1000} seconds`));
        }, EXTRACTOR_TIMEOUT_MS);

        cp.execFile(command, args, (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error) {
                reject(new Error(stderr || error.message || 'Unknown error'));
            } else {
                resolve(stdout);
            }
        });
    });
}
