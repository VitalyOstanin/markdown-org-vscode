import * as vscode from 'vscode';
import { AgendaPanel } from '../views/agendaPanel';
import type { AgendaData } from '../types';
import { normalizeAgendaTaskTypes } from '../utils/normalizeTaskType';
import { toIsoDate } from '../utils';
import { exec } from '../utils/exec';
import { filterTasksByTag } from '../utils/tagFilter';
import { EXTRACTOR_MAX_BUFFER_BYTES, EXTRACTOR_TIMEOUT_MS, extractor } from '../utils/extractor';
import { formatError, notifyError, notifyInfo, notifyWarn } from '../utils/notify';
import { buildTagCycle, computeNextTag, resolveRequestedTag } from '../utils/cycleTag';
import { nextHeaderMode } from '../utils/agendaHeaderMode';
import { nextGrouping } from '../utils/agendaGrouping';
import { buildExecError } from '../utils/execError';
import { currentConfigTarget } from '../utils/configTarget';
import { resolveAgendaDirectories } from '../utils/agendaDirectories';
import { configuredWeekStart } from '../utils/agendaWeekStart';
import { currentTagDictionary } from '../utils/agendaTags';
import { renderTagDictionaryReport } from '../utils/tagDictionaryReport';
import { getCachedHolidays } from '../utils/holidaysCache';
import { logDiagnostic } from '../utils/logChannel';

/**
 * Open the agenda webview for the given mode (day/week/month/tasks).
 * Validates the extractor path, then loads data via the extractor process.
 * Disabled in untrusted workspaces.
 */
export async function showAgenda(
    _context: vscode.ExtensionContext,
    mode: 'day' | 'week' | 'month' | 'tasks',
    initialDate?: string
) {
    if (!vscode.workspace.isTrusted) {
        notifyWarn('Agenda is disabled in untrusted workspaces');
        return;
    }

    const extractorPath = await extractor.resolveExtractorPath();
    if (!extractorPath) {
        return;
    }

    const startupConfig = vscode.workspace.getConfiguration('markdown-org');
    // Read once, at open: the same list feeds every refresh of this panel, and
    // a settings change reaches the agenda through the reopen it already needs.
    const workspaceDirs = resolveAgendaDirectories(
        startupConfig.get<string[]>('workspaceDirs'),
        startupConfig.get<string>('workspaceDir'),
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    );

    if (workspaceDirs.length === 0) {
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
        } catch (error) {
            // Graceful degradation: missing/older extractor binaries do not
            // expose --holidays. The agenda must still render, so we fall back
            // to "no holidays" rather than surfacing an error every time the
            // panel refreshes. The cache itself does not memoise failures, so
            // the next agenda open will retry the extractor.
            //
            // The reason still goes to the log channel: an unsupported option
            // and a broken binary (timeout, unparsable output) both land here,
            // and without a record "holidays are not highlighted" is
            // indistinguishable from "the extractor is failing".
            logDiagnostic(`holidays for ${year} unavailable: ${formatError(error)}`);
            return [];
        }
    };

    /**
     * Run the extractor and turn its output into what a render needs, or
     * report the failure and return `undefined`.
     */
    const loadPayload = async (
        args: string[],
        anchor: string | undefined
    ): Promise<{ data: AgendaData; currentTag: string; tagNames: string[]; holidays: string[] } | undefined> => {
        try {
            const result = await execCommand(extractorPath, args);
            // Parse boundary: the extractor JSON arrives untyped. Normalize
            // every task's `task_type` to the known keyword set here so the
            // `Task.task_type: TaskStatus | undefined` contract holds for all
            // downstream code; unknown future keywords degrade to `undefined`.
            const rawData = normalizeAgendaTaskTypes(JSON.parse(result) as AgendaData);
            const config = vscode.workspace.getConfiguration('markdown-org');
            const currentTag = config.get<string>('currentTag', 'ALL');
            // The same dictionary answers both questions of this load: which
            // tasks the selected tag keeps, and which names the dropdown
            // offers. Reading it twice could show a tag the data was not
            // filtered by, if a tags file arrived in between.
            const dictionary = await currentTagDictionary();
            const data = filterTasksByTag(rawData, currentTag, dictionary);
            // `anchor` is an ISO date when set, so the year is its first part;
            // an unexpected shape parses to NaN exactly as it did before.
            const year = anchor ? parseInt(anchor.split('-')[0] ?? '', 10) : new Date().getFullYear();

            return {
                data,
                currentTag,
                tagNames: dictionary.map((tag) => tag.name),
                holidays: await getHolidays(year)
            };
        } catch (error) {
            notifyError(`Failed to load agenda: ${formatError(error)}`);
            return undefined;
        }
    };

    const loadData = async (newShiftedToday?: string, userInitiated = false) => {
        // `newShiftedToday` is set when the user clicked Prev/Next/Today
        // inside the webview (refreshCallback(message.date, true)) — that's
        // an explicit jump. When it's undefined, this is the initial open
        // or a repeated Show Agenda command, which should keep scroll.
        const navigation = newShiftedToday !== undefined;
        if (newShiftedToday !== undefined) {
            shiftedToday = newShiftedToday;
        }
        // Empty means "no anchor", same as absent -- hence the falsiness test
        // rather than a nullish one.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        shiftedToday ||= toIsoDate(new Date());

        // One `--dir` per configured directory: the extractor merges them into
        // one agenda and tags every task with the root it came from, which is
        // what the collection mark on a row reads.
        const args = workspaceDirs.flatMap((dir) => ['--dir', dir]);
        args.push('--format', 'json', '--absolute-paths');
        if (mode === 'tasks') {
            args.push('--tasks');
        } else {
            // The month view asks for the grid it draws, not the month it is
            // named after: `month-grid` answers with the whole weeks the month
            // touches, so the padding cells carry the tasks dated to them
            // instead of standing empty. The week it begins on is the setting's
            // (extractor 0.17.0), and the same value heads the page's columns.
            if (mode === 'month') {
                args.push('--agenda', 'month-grid', '--week-start', configuredWeekStart());
            } else {
                args.push('--agenda', mode);
            }
            // Two different things, hence two flags. `--date` is the window
            // anchor and follows Prev/Next; `--current-date` is "today" and
            // always the host's local date. Without the latter the extractor
            // derives today from its own `--tz` default (Europe/Moscow), so a
            // user in another zone sees the neighbouring day's overdue and
            // upcoming buckets and a repeater hint one day off.
            args.push('--date', shiftedToday);
            args.push('--current-date', toIsoDate(new Date()));
        }

        // Loading and rendering are reported separately: a panel that fails to
        // open is not an extractor problem, and calling it "Failed to load
        // agenda" sends the user looking in the wrong place. Loading lives in
        // its own function so its results stay `const` instead of being hoisted
        // as uninitialized `let`s just to outlive the try block.
        const loaded = await loadPayload(args, shiftedToday);
        if (!loaded) {
            return;
        }

        try {
            AgendaPanel.render({
                data: loaded.data,
                mode,
                shiftedToday,
                refreshCallback: loadData,
                userInitiated,
                currentTag: loaded.currentTag,
                tagNames: loaded.tagNames,
                holidays: loaded.holidays,
                navigation
            });
        } catch (error) {
            notifyError(`Failed to render agenda: ${formatError(error)}`);
        }
    };

    await loadData(undefined, true);
}

/**
 * Advance the file-tag filter (`markdown-org.currentTag`) to the next tag of
 * the dictionary -- the tags the notes directories declare together with those
 * of `markdown-org.fileTags`.
 */
export async function cycleTag(_context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const dictionary = await currentTagDictionary();
    const currentTag = config.get<string>('currentTag', 'ALL');

    if (dictionary.length === 0) {
        notifyWarn('No file tags declared by the notes directories or configured in markdown-org.fileTags');
        return;
    }

    const tagNames = dictionary.map((t) => t.name);

    // A cycle of just [ALL] means there is nothing to rotate to -- every
    // declared entry is named "ALL". Warn instead of silently staying on ALL.
    if (buildTagCycle(tagNames).length <= 1) {
        notifyWarn('Only "ALL" is declared; nothing to cycle to');
        return;
    }

    const nextTag = computeNextTag(currentTag, tagNames);

    const target = currentConfigTarget();
    await config.update('currentTag', nextTag, target);
    notifyInfo(`Tag filter: ${nextTag}`);

    AgendaPanel.refresh();
}

/**
 * Advance `markdown-org.agendaHeaderMode` one step: auto -> full -> compact.
 *
 * No toast, unlike {@link cycleTag}: the panel button carries the current mode
 * as its label and the header reflows on the spot, so the outcome is on screen
 * either way -- and a message on every click of a layout toggle is noise. The
 * setting change reaches an open panel through the configuration listener.
 */
export async function cycleAgendaHeaderMode() {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const next = nextHeaderMode(config.get<string>('agendaHeaderMode'));
    await config.update('agendaHeaderMode', next, currentConfigTarget());
}

/**
 * Switch `markdown-org.agendaGrouping` between `sections` and `flat`.
 *
 * The other half of the same question the header mode answers -- how much of a
 * short panel goes to chrome -- and it is asked at the same moment, when the
 * panel is resized. Without this the setting is reachable only through the
 * settings editor, which is a long way round for something toggled while
 * reading. No toast: the day redraws with or without its headings on the spot,
 * and the configuration listener carries the change to an open panel.
 */
export async function cycleAgendaGrouping() {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const next = nextGrouping(config.get<string>('agendaGrouping'));
    await config.update('agendaGrouping', next, currentConfigTarget());
}

/**
 * Apply a specific file-tag filter chosen directly from the agenda's tag
 * dropdown. Unlike {@link cycleTag} this jumps straight to the picked tag; a
 * request stale against the current dictionary resolves to "ALL" (see
 * {@link resolveRequestedTag}). No toast: the dropdown selection is already
 * explicit feedback, and one on every pick would be noise.
 */
export async function setTag(_context: vscode.ExtensionContext, requestedTag: string) {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const tagNames = (await currentTagDictionary()).map((t) => t.name);
    const target = currentConfigTarget();
    await config.update('currentTag', resolveRequestedTag(requestedTag, tagNames), target);

    AgendaPanel.refresh();
}

/**
 * Show what the tags mean and who said so.
 *
 * The dropdown offers a name; behind it several notes directories and the
 * settings have been merged. This opens the merged dictionary as a Markdown
 * document, each pattern with what it does and where it was declared -- the
 * only way to see why a tag selects what it selects.
 */
export async function showTagDictionary() {
    const document = await vscode.workspace.openTextDocument({
        content: renderTagDictionaryReport(await currentTagDictionary()),
        language: 'markdown'
    });
    await vscode.window.showTextDocument(document, { preview: true });
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
