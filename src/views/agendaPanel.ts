import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { AgendaData } from '../types';
import { isMeaningfulSelection, resolveTaskClickIntent, sanitizeTaskLine } from '../utils/agendaClick';
import { rememberScroll, recallScroll } from '../utils/agendaScroll';
import { resolveHeadingClass } from '../utils/agendaHeadingTint';
import { resolveAgendaWatchBase } from '../utils/agendaWatchPattern';
import { toIsoDate } from '../utils/isoDate';
import { formatError, notifyError } from '../utils/notify';

const REFRESH_DEBOUNCE_MS = 500;
const CALENDAR_COLS = 7;
type FirstDayOfWeek = 'monday' | 'sunday' | 'auto';

function msUntilNextLocalMidnight(now: Date): number {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return next.getTime() - now.getTime();
}

function generateNonce(): string {
    return randomBytes(16).toString('base64');
}

export class AgendaPanel {
    private static currentPanel?: vscode.WebviewPanel;
    private static watcher?: vscode.FileSystemWatcher;
    private static debounceTimer?: NodeJS.Timeout;
    private static refreshCallback?: (shiftedToday?: string, userInitiated?: boolean) => Promise<void>;
    // The "anchor" date the panel is currently built around: today + any
    // Prev/Next offset the user has applied. Equals today on first open and
    // after the Today button; offset elsewhere. Drives the extractor query,
    // the navbar label, and which date the navigation buttons step from.
    private static shiftedToday?: string;
    private static dayCheckTimer?: NodeJS.Timeout;

    private static setAgendaFocusedContext(focused: boolean) {
        vscode.commands.executeCommand('setContext', 'markdown-org.agendaFocused', focused);
    }

    private static scheduleNextDayCheck() {
        AgendaPanel.dayCheckTimer = setTimeout(() => {
            AgendaPanel.refreshCallback?.();
            if (AgendaPanel.currentPanel) {
                AgendaPanel.scheduleNextDayCheck();
            }
        }, msUntilNextLocalMidnight(new Date()));
    }

    public static render(
        _context: vscode.ExtensionContext,
        data: AgendaData,
        mode: string,
        shiftedToday: string | undefined,
        refreshCallback?: (shiftedToday?: string, userInitiated?: boolean) => Promise<void>,
        userInitiated: boolean = true,
        currentTag?: string,
        holidays?: string[],
        // True when this render came from an explicit jump (Prev/Next/Today
        // button or switch-mode), false for the initial open or a repeated
        // Show Agenda command. The webview uses this to decide whether to
        // scroll to today (jump) or keep the user's scroll (repeat).
        navigation: boolean = false
    ) {
        if (refreshCallback) {
            AgendaPanel.refreshCallback = refreshCallback;
        }
        AgendaPanel.shiftedToday = shiftedToday || toIsoDate(new Date());
        const config = vscode.workspace.getConfiguration('markdown-org');
        const locale = config.get<string>('dateLocale', 'en-US');
        const firstDayOfWeek = config.get<FirstDayOfWeek>('firstDayOfWeek', 'monday');

        if (AgendaPanel.currentPanel) {
            AgendaPanel.updateExistingPanel(
                data,
                mode,
                shiftedToday,
                currentTag,
                firstDayOfWeek,
                userInitiated,
                navigation
            );
        } else {
            AgendaPanel.createNewPanel(data, mode, locale, currentTag, holidays, firstDayOfWeek);
        }

        if (!AgendaPanel.watcher && refreshCallback) {
            AgendaPanel.ensureWatcher(config);
        }

        if (!AgendaPanel.dayCheckTimer && refreshCallback) {
            AgendaPanel.scheduleNextDayCheck();
        }
    }

    private static updateExistingPanel(
        data: AgendaData,
        mode: string,
        shiftedToday: string | undefined,
        currentTag: string | undefined,
        firstDayOfWeek: FirstDayOfWeek,
        userInitiated: boolean,
        navigation: boolean
    ) {
        const panel = AgendaPanel.currentPanel!;
        if (userInitiated) {
            panel.reveal(vscode.ViewColumn.One);
        }
        panel.title = `Agenda: ${mode}`;
        panel.webview.postMessage({
            type: 'update',
            data,
            mode,
            shiftedToday,
            currentTag,
            firstDayOfWeek,
            userInitiated,
            navigation
        });
    }

    private static createNewPanel(
        data: AgendaData,
        mode: string,
        locale: string,
        currentTag: string | undefined,
        holidays: string[] | undefined,
        firstDayOfWeek: FirstDayOfWeek
    ) {
        AgendaPanel.currentPanel = vscode.window.createWebviewPanel(
            'markdownOrgAgenda',
            `Agenda: ${mode}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        // Drives the `markdown-org.agendaFocused` when-clause so show/cycle
        // keybindings (Ctrl+K Ctrl+W, Ctrl+K Ctrl+M, cycleTag) keep working
        // when the user is inside the agenda webview and no markdown editor
        // is focused.
        AgendaPanel.setAgendaFocusedContext(true);

        AgendaPanel.currentPanel.onDidChangeViewState((e) => {
            AgendaPanel.setAgendaFocusedContext(e.webviewPanel.active);
        });

        AgendaPanel.currentPanel.onDidDispose(() => AgendaPanel.handleDispose());
        AgendaPanel.currentPanel.webview.onDidReceiveMessage((message) => AgendaPanel.handleWebviewMessage(message));

        const nonce = generateNonce();
        const cspSource = AgendaPanel.currentPanel.webview.cspSource;
        AgendaPanel.currentPanel.webview.html = AgendaPanel.getHtmlContent(
            data,
            mode,
            locale,
            currentTag || 'ALL',
            holidays || [],
            nonce,
            cspSource
        );

        AgendaPanel.currentPanel.webview.postMessage({
            command: 'init',
            data,
            mode,
            locale,
            shiftedToday: AgendaPanel.shiftedToday,
            currentTag: currentTag || 'ALL',
            holidays: holidays || [],
            firstDayOfWeek
        });
    }

    private static handleDispose() {
        AgendaPanel.setAgendaFocusedContext(false);
        AgendaPanel.currentPanel = undefined;
        AgendaPanel.watcher?.dispose();
        AgendaPanel.watcher = undefined;
        AgendaPanel.refreshCallback = undefined;
        // The next agenda open must rebuild its anchor date from
        // initialDate/toIsoDate(today). Keeping a stale shiftedToday from a
        // previous session around would leak into AgendaPanel.refresh()
        // (which reads it directly) the moment a fresh refreshCallback is
        // wired up.
        AgendaPanel.shiftedToday = undefined;
        if (AgendaPanel.debounceTimer) {
            clearTimeout(AgendaPanel.debounceTimer);
            AgendaPanel.debounceTimer = undefined;
        }
        if (AgendaPanel.dayCheckTimer) {
            clearTimeout(AgendaPanel.dayCheckTimer);
            AgendaPanel.dayCheckTimer = undefined;
        }
    }

    private static async handleWebviewMessage(message: {
        command: string;
        file?: string;
        line?: number;
        switchToDay?: boolean;
        date?: string;
        mode?: string;
    }) {
        if (message.command === 'openTask') {
            if (typeof message.file !== 'string' || typeof message.line !== 'number') {
                return;
            }
            await AgendaPanel.openTaskInEditor(message.file, message.line);
        } else if (message.command === 'navigate') {
            if (message.switchToDay) {
                AgendaPanel.currentPanel?.dispose();
                await vscode.commands.executeCommand('markdown-org.showAgendaDay', message.date);
            } else {
                AgendaPanel.refreshCallback?.(message.date, true);
            }
        } else if (message.command === 'cycleTag') {
            await vscode.commands.executeCommand('markdown-org.cycleTag');
        } else if (message.command === 'switchMode') {
            const targetCommand =
                message.mode === 'day'
                    ? 'markdown-org.showAgendaDay'
                    : message.mode === 'week'
                      ? 'markdown-org.showAgendaWeek'
                      : message.mode === 'month'
                        ? 'markdown-org.showAgendaMonth'
                        : message.mode === 'tasks'
                          ? 'markdown-org.showTasks'
                          : null;
            if (targetCommand) {
                await vscode.commands.executeCommand(targetCommand, AgendaPanel.shiftedToday);
            }
        }
    }

    private static ensureWatcher(config: vscode.WorkspaceConfiguration) {
        // Scope the watcher to the directory that the extractor actually
        // sweeps. With a bare `**/*.md` pattern, the underlying OS primitive
        // (inotify/FSEvents/etc.) registers watches for every `.md` under
        // the workspace, including node_modules / .git / .vscode-test, even
        // though triggerRefresh ignores those events. A RelativePattern with
        // the workspace dir as the base avoids setting up those watches in
        // the first place.
        const watchBase = resolveAgendaWatchBase(
            config.get<string>('workspaceDir'),
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        );
        const pattern: vscode.GlobPattern = watchBase ? new vscode.RelativePattern(watchBase, '**/*.md') : '**/*.md';
        AgendaPanel.watcher = vscode.workspace.createFileSystemWatcher(pattern);

        const ignored = (uri: vscode.Uri) => {
            // Normalize backslashes to forward slashes so the same checks
            // work regardless of how `fsPath` is rendered on the current
            // platform (Windows can produce either style depending on the
            // URI source).
            const normalized = uri.fsPath.replace(/\\/g, '/');
            return (
                normalized.endsWith('.archive.md') ||
                normalized.includes('/.git/') ||
                normalized.includes('/node_modules/')
            );
        };

        const triggerRefresh = (uri: vscode.Uri) => {
            if (ignored(uri)) {
                return;
            }
            if (AgendaPanel.debounceTimer) {
                clearTimeout(AgendaPanel.debounceTimer);
            }
            AgendaPanel.debounceTimer = setTimeout(() => {
                AgendaPanel.refreshCallback?.();
            }, REFRESH_DEBOUNCE_MS);
        };

        AgendaPanel.watcher.onDidChange(triggerRefresh);
        AgendaPanel.watcher.onDidCreate(triggerRefresh);
        AgendaPanel.watcher.onDidDelete(triggerRefresh);
    }

    /**
     * Test-only helper: ask the webview for a snapshot of the day-header
     * `data-date` attributes currently in the rendered DOM. Used by the
     * agenda integration suite to verify that renderAgenda produced the
     * expected dates for a given anchor; production code never queries
     * this. Returns null when no panel is open.
     */
    public static queryRenderedInfoForTesting(
        timeoutMs: number = 2000
    ): Promise<{ dayHeaders: string[]; mode: string } | null> {
        const panel = AgendaPanel.currentPanel;
        if (!panel) {
            return Promise.resolve(null);
        }
        return new Promise((resolve, reject) => {
            const sub = panel.webview.onDidReceiveMessage(
                (m: { command: string; dayHeaders?: string[]; mode?: string }) => {
                    if (m.command === 'renderedInfo') {
                        clearTimeout(timer);
                        sub.dispose();
                        resolve({ dayHeaders: m.dayHeaders ?? [], mode: m.mode ?? '' });
                    }
                }
            );
            const timer = setTimeout(() => {
                sub.dispose();
                reject(new Error(`webview did not respond to getRenderedInfo within ${timeoutMs}ms`));
            }, timeoutMs);
            panel.webview.postMessage({ command: 'getRenderedInfo' });
        });
    }

    /**
     * Open a file at the given 1-based line in an editor. The path is expected
     * to be absolute (the agenda passes `--absolute-paths` to
     * `markdown-org-extract`). Failures from `openTextDocument` are surfaced
     * via `showErrorMessage` instead of being silently swallowed.
     *
     * Exposed for integration tests (see CLAUDE.md for why we do not gate
     * this path on `workspaceFolders`).
     */
    public static async openTaskInEditor(file: string, line: number): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(file);
            const pos = new vscode.Position(Math.max(0, line - 1), 0);
            await vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(pos, pos)
            });
        } catch (err) {
            notifyError(`failed to open ${file}: ${formatError(err)}`);
        }
    }

    /** Reload data into the panel without re-focusing it. Re-reads settings (including tag filter). */
    public static refresh() {
        if (AgendaPanel.refreshCallback) {
            AgendaPanel.refreshCallback(AgendaPanel.shiftedToday, false);
        }
    }

    private static getHtmlContent(
        data: AgendaData,
        mode: string,
        locale: string,
        currentTag: string,
        holidays: string[],
        nonce: string,
        cspSource: string
    ): string {
        // Inline the click-handling helpers into the webview script. The
        // same functions are unit-tested in agendaClick.test.ts (jsdom),
        // so those tests transitively cover the webview behaviour.
        const selectionGuardSource = isMeaningfulSelection.toString();
        const clickIntentSource = resolveTaskClickIntent.toString();
        // Defense-in-depth: sanitize task.line before interpolating it into
        // the data-line HTML attribute. Unit-tested in agendaClick.test.ts.
        const sanitizeTaskLineSource = sanitizeTaskLine.toString();
        // Same approach for the scroll-memory helpers that restore the
        // user's last scroll on Prev/Next round-trips (e.g. Next Week then
        // Prev Week back to the same week); unit-tested in
        // agendaScroll.test.ts.
        const rememberScrollSource = rememberScroll.toString();
        const recallScrollSource = recallScroll.toString();
        // Heading tint resolver (DEADLINE > priority > default);
        // unit-tested in agendaHeadingTint.test.ts.
        const resolveHeadingClassSource = resolveHeadingClass.toString();
        // Local-date formatter shared with host code; unit-tested in
        // isoDate.test.ts.
        const toIsoDateSource = toIsoDate.toString();
        return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        body { 
            font-family: 'Courier New', monospace; 
            padding: 20px;
            background: #1e1e1e;
            color: #e0e0e0;
            line-height: 1.6;
        }
        .nav-bar {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            align-items: center;
        }
        .nav-btn {
            background: #0e639c;
            color: #fff;
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
        }
        .nav-btn:hover {
            background: #1177bb;
        }
        .mode-switch {
            display: inline-flex;
            margin-right: 8px;
        }
        .mode-btn {
            background: #2d2d30;
            color: #d4d4d4;
            border: 1px solid #3e3e42;
            padding: 5px 10px;
            cursor: pointer;
            font-family: inherit;
            font-size: 13px;
        }
        .mode-btn + .mode-btn {
            border-left: none;
        }
        .mode-btn:hover {
            background: #3e3e42;
        }
        .mode-btn.active {
            background: #0e639c;
            color: #fff;
            border-color: #0e639c;
            font-weight: bold;
        }
        .current-date {
            color: #4fc1ff;
            font-weight: bold;
            font-size: 1.05em;
            margin: 4px 0 16px 0;
        }
        .tag-indicator {
            color: #dcdcaa;
            font-weight: bold;
            margin-left: auto;
            cursor: pointer;
        }
        .tag-indicator:hover {
            color: #4fc1ff;
        }
        .day-header {
            color: #4fc1ff;
            font-weight: bold;
            margin: 20px 0 5px 0;
            display: grid;
            /* 3-column day header (see formatDayHeader): weekday | day | month+year. */
            grid-template-columns: 120px 30px 1fr;
            column-gap: 1ch;
        }
        .task-line {
            display: grid;
            /* 6-column task line (see renderTask): todo: | time | status | priority | heading | date.
               When adding/removing a column, update renderTask in lockstep — the grid does not
               span-collapse, so a missing span shifts every column right of it. */
            grid-template-columns: auto 140px 60px 60px 1fr 90px;
            gap: 8px;
            margin: 2px 0;
            cursor: pointer;
            font-size: 1.1em;
        }
        .task-line:hover {
            background: #2d2d30;
        }
        .todo-label { color: #f48771; }
        .todo-keyword { color: #f48771; font-weight: bold; }
        .done-keyword { color: #73c991; font-weight: bold; }
        .priority-a { color: #f48771; font-weight: bold; }
        .priority-b { color: #dcdcaa; font-weight: bold; }
        .priority-c { color: #4ec9b0; font-weight: bold; }
        /* Heading tint by priority -- same hue AND weight as the marker
           (full font match). Loses to .deadline-heading (DEADLINE wins
           by design -- it's the louder signal). */
        .heading-priority-a { color: #f48771; font-weight: bold; }
        .heading-priority-b { color: #dcdcaa; font-weight: bold; }
        .heading-priority-c { color: #4ec9b0; font-weight: bold; }
        .time-display { color: #4fc1ff; font-weight: bold; }
        .timestamp-type { font-weight: bold; }
        .timestamp-deadline { color: #f48771; font-weight: bold; }
        .date-overdue { color: #808080; text-align: right; }
        .date-upcoming { color: #4fc1ff; text-align: right; font-weight: bold; }
        .deadline-heading { color: #f48771; font-weight: bold; }
        .calendar {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 2px;
            margin: 20px 0;
            max-width: 800px;
        }
        .calendar-header {
            text-align: center;
            font-weight: bold;
            color: #4fc1ff;
            padding: 8px;
            background: #2d2d30;
        }
        .calendar-day {
            aspect-ratio: 1;
            border: 1px solid #3e3e42;
            padding: 8px;
            cursor: pointer;
            background: #252526;
            position: relative;
        }
        .calendar-day.weekend {
            background: #2a2a2d;
        }
        .calendar-day.holiday {
            background: #3a2a2d;
        }
        .calendar-day.has-tasks {
            border-color: #4fc1ff;
            font-weight: bold;
        }
        .calendar-day.today {
            border: 2px solid #4fc1ff;
            background: #1e3a4f;
        }
        .calendar-day.other-month {
            opacity: 0.3;
        }
        .day-number {
            font-size: 14px;
        }
        .task-indicator {
            position: absolute;
            bottom: 4px;
            right: 4px;
            width: 6px;
            height: 6px;
            background: #4fc1ff;
            border-radius: 50%;
        }
    </style>
</head>
<body>
    <div class="nav-bar" id="nav-bar"></div>
    <div class="current-date" id="current-date"></div>
    <div id="content"></div>
    <script nonce="${nonce}">
        ${selectionGuardSource}
        ${clickIntentSource}
        ${sanitizeTaskLineSource}
        ${rememberScrollSource}
        ${recallScrollSource}
        ${resolveHeadingClassSource}
        ${toIsoDateSource}
        const vscode = acquireVsCodeApi();
        let initialData = [];
        let initialMode = '';
        let locale = '';
        // The anchor date the panel is built around: today plus any
        // Prev/Next offset. Equals today on first open and after the Today
        // button; can move forward/backward via navigation. Drives the
        // navbar label, Prev/Next stepping, and the month-calendar target.
        let shiftedToday = '';
        let currentTag = '';
        let holidays = [];
        let firstDayOfWeek = 'monday';
        // Per-anchor scroll memory. Saved on every navigate() before the
        // postMessage and restored on navigation=true updates so that a
        // round-trip (Next then Prev, or Prev then Next) returns the user
        // to where they were instead of snapping back to today's header.
        const scrollHistory = {};

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'init') {
                initialData = message.data;
                initialMode = message.mode;
                locale = message.locale;
                shiftedToday = message.shiftedToday;
                currentTag = message.currentTag;
                holidays = message.holidays;
                if (message.firstDayOfWeek) {
                    firstDayOfWeek = message.firstDayOfWeek;
                }
                renderNavBar();
                if (initialMode === 'month') {
                    document.getElementById('content').innerHTML = renderMonthCalendar(initialData);
                    attachCalendarListeners();
                } else if (initialMode === 'day' || initialMode === 'week') {
                    document.getElementById('content').innerHTML = renderAgenda(initialData);
                    attachTaskListeners();
                } else if (initialMode === 'tasks') {
                    document.getElementById('content').innerHTML = renderTasks(initialData);
                    attachTaskListeners();
                }
                scrollToWeekFocus();
            } else if (message.type === 'update') {
                if (message.shiftedToday) {
                    shiftedToday = message.shiftedToday;
                }
                if (message.currentTag) {
                    currentTag = message.currentTag;
                }
                if (message.mode) {
                    initialMode = message.mode;
                }
                if (message.firstDayOfWeek) {
                    firstDayOfWeek = message.firstDayOfWeek;
                }
                initialData = message.data;
                const userInitiated = message.userInitiated === true;
                const navigation = message.navigation === true;
                const scrollPos = window.scrollY;
                const wasOnCurrentWeek = currentWeekIsVisible();
                renderNavBar();
                if (initialMode === 'month') {
                    document.getElementById('content').innerHTML = renderMonthCalendar(initialData);
                    attachCalendarListeners();
                } else if (initialMode === 'day' || initialMode === 'week') {
                    document.getElementById('content').innerHTML = renderAgenda(initialData);
                    attachTaskListeners();
                } else if (initialMode === 'tasks') {
                    document.getElementById('content').innerHTML = renderTasks(initialData);
                    attachTaskListeners();
                }
                if (!userInitiated) {
                    // File-watcher / cycleTag refresh -- keep scroll.
                    window.scrollTo(0, scrollPos);
                } else if (initialMode !== 'week') {
                    // Day / month / tasks have no per-day scroll anchor.
                } else if (navigation) {
                    // Prev/Next/Today. If we've been on this anchor before
                    // (round-trip case), restore the user's last scroll
                    // there; otherwise focus the week as usual.
                    const remembered = recallScroll(scrollHistory, shiftedToday);
                    if (remembered !== null) {
                        window.scrollTo(0, remembered);
                    } else {
                        scrollToWeekFocus();
                    }
                } else if (wasOnCurrentWeek && currentWeekIsVisible()) {
                    // Repeated Show Agenda (Week) on the same current week --
                    // keep the user's place.
                    window.scrollTo(0, scrollPos);
                } else {
                    scrollToWeekFocus();
                }
            } else if (message.command === 'getRenderedInfo') {
                // Integration-test query: snapshot the rendered DOM so the
                // host can verify that renderAgenda produced the expected
                // day-headers for the given anchor date. Production code
                // never sends this query, so it has no effect on normal use.
                const headers = Array.from(document.querySelectorAll('.day-header'))
                    .map(el => el.getAttribute('data-date'))
                    .filter(d => d !== null);
                vscode.postMessage({ command: 'renderedInfo', dayHeaders: headers, mode: initialMode });
            }
        });
        
        function parseLocalDate(str) {
            const [y, m, d] = str.split('-').map(Number);
            return new Date(y, m - 1, d);
        }

        function isHoliday(date) {
            return holidays.includes(date);
        }
        
        function navigateToDay(date) {
            vscode.postMessage({ command: 'navigate', date: date, switchToDay: true });
        }
        
        function attachCalendarListeners() {
            document.querySelectorAll('.calendar-day').forEach(el => {
                const date = el.getAttribute('data-date');
                if (date) {
                    el.addEventListener('click', () => navigateToDay(date));
                }
            });
        }
        
        function attachTaskListeners() {
            document.getElementById('content').addEventListener('click', (e) => {
                // Source of truth: src/utils/agendaClick.ts -- jsdom tested.
                const intent = resolveTaskClickIntent(e, window.getSelection());
                if (intent) {
                    vscode.postMessage({
                        command: 'openTask',
                        file: intent.file,
                        line: intent.line
                    });
                }
            });
        }
        
        function renderAgenda(days) {
            const today = toIsoDate(new Date());
            // Array-of-fragments + join instead of string += because V8 keeps
            // re-allocating on each concat for long agendas (a full Month view
            // can emit ~30 days * 4 buckets * N tasks). Output is identical.
            const parts = [];
            days.forEach(day => {
                const isToday = day.date === today;
                const headerCls = 'day-header' + (isToday ? ' day-header-today' : '');
                parts.push('<div class="' + headerCls + '" data-date="' + escapeHtml(day.date) + '">' + formatDayHeader(day.date, isToday) + '</div>');
                (day.overdue || []).forEach(task => parts.push(renderTask(task, task.days_offset, 'overdue')));
                (day.scheduled_timed || []).forEach(task => parts.push(renderTask(task, task.days_offset)));
                (day.scheduled_no_time || []).forEach(task => parts.push(renderTask(task, task.days_offset)));
                (day.upcoming || []).forEach(task => parts.push(renderTask(task, task.days_offset, 'upcoming')));
            });
            return parts.join('');
        }

        // The week view scrolls to today's header when today is in the
        // visible range; when the user navigates to another week (Prev/Next
        // moved them off the current week), it starts at the top instead of
        // landing them mid-week on the day-of-week that happens to share
        // shiftedToday. Day/month/tasks have no equivalent per-day anchor.
        function currentWeekIsVisible() {
            return !!document.querySelector('.day-header[data-date="' + toIsoDate(new Date()) + '"]');
        }
        function scrollToWeekFocus() {
            if (initialMode !== 'week') return;
            requestAnimationFrame(() => {
                const target = document.querySelector('.day-header[data-date="' + toIsoDate(new Date()) + '"]');
                if (target) {
                    target.scrollIntoView({ block: 'start', behavior: 'auto' });
                } else {
                    window.scrollTo(0, 0);
                }
            });
        }
        
        function renderTasks(tasks) {
            const priorities = ['A', 'B', 'C', ''];
            const parts = [];
            priorities.forEach(priority => {
                const filtered = tasks.filter(t => (t.priority || '') === priority);
                if (filtered.length === 0) return;
                const header = priority ? 'Priority [#' + priority + ']' : 'No priority';
                parts.push('<div class="day-header"><span>' + escapeHtml(header) + '</span></div>');
                filtered.forEach(task => parts.push(renderTask(task)));
            });
            return parts.join('');
        }
        
        function formatDayHeader(date, isToday) {
            const d = parseLocalDate(date);
            const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
            const dayMonth = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
            const year = d.toLocaleDateString(locale, { year: 'numeric' });
            const parts = dayMonth.split(' ');
            const day = parts[0];
            const month = parts.slice(1).join(' ');
            const arrowL = isToday ? '❯ ' : '';
            const arrowR = isToday ? ' ❮' : '';
            return '<span>' + arrowL + weekday + '</span><span style="text-align: right">' + day + '</span><span>' + month + ' ' + year + arrowR + '</span>';
        }
        
        function renderTask(task, daysOffset, taskType) {
            const timeInfo = getTimeInfo(task, daysOffset);
            const status = task.task_type || '';
            const priority = task.priority ? '[#' + task.priority + ']' : '';
            const priorityClass = task.priority ? 'priority-' + task.priority.toLowerCase() : '';
            const statusClass = status === 'TODO' ? 'todo-keyword' : status === 'DONE' ? 'done-keyword' : '';

            const dateDisplay = (daysOffset !== undefined && daysOffset !== 0 && task.timestamp_date)
                ? formatDateForTitle(task.timestamp_date)
                : '';
            const dateClass = taskType === 'upcoming' ? 'date-upcoming' : 'date-overdue';
            // Source of truth: src/utils/agendaHeadingTint.ts -- unit tested.
            const headingClass = resolveHeadingClass(task);

            return '<div class="task-line" data-file="' + escapeHtml(task.file) + '" data-line="' + sanitizeTaskLine(task.line) + '">' +
                '<span class="todo-label">todo:</span>' +
                '<span>' + timeInfo + '</span>' +
                '<span class="' + statusClass + '">' + escapeHtml(status) + '</span>' +
                '<span class="' + priorityClass + '">' + escapeHtml(priority) + '</span>' +
                '<span class="' + headingClass + '">' + escapeHtml(task.heading) + '</span>' +
                '<span class="' + dateClass + '">' + dateDisplay + '</span>' +
                '</div>';
        }
        
        function formatDateForTitle(dateStr) {
            const d = parseLocalDate(dateStr);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return day + '.' + month + '.' + year;
        }
        
        function getTimeInfo(task, daysOffset) {
            if (task.timestamp_time) {
                const type = task.timestamp_type;
                if (type && type !== 'PLAIN' && type !== 'SCHEDULED') {
                    const typeClass = type === 'DEADLINE' ? 'timestamp-deadline' : 'timestamp-type';
                    return '<span class="time-display">' + escapeHtml(task.timestamp_time) + '</span>...... <span class="' + typeClass + '">' + escapeHtml(type) + ' ⌃</span>';
                }
                return '<span class="time-display">' + escapeHtml(task.timestamp_time) + '</span>......';
            }
            if (daysOffset !== undefined) {
                if (daysOffset < 0) {
                    const daysAgo = Math.abs(daysOffset);
                    if (task.timestamp_type === 'SCHEDULED') {
                        return 'Sched.' + daysAgo + 'x:';
                    }
                    return daysAgo + ' d. ago:';
                }
                if (daysOffset > 0) {
                    return 'In ' + daysOffset + ' d.:';
                }
            }
            const type = task.timestamp_type;
            if (type && type !== 'PLAIN' && type !== 'SCHEDULED') {
                const typeClass = type === 'DEADLINE' ? 'timestamp-deadline' : 'timestamp-type';
                return '<span class="' + typeClass + '">' + escapeHtml(type) + ' ⌃</span>';
            }
            return '';
        }
        
        function resolveFirstDayOffset() {
            // 0 = Sunday-first, 1 = Monday-first (only these two supported in UI).
            if (firstDayOfWeek === 'sunday') return 0;
            if (firstDayOfWeek === 'monday') return 1;
            try {
                const info = new Intl.Locale(locale).weekInfo;
                if (info && info.firstDay === 7) return 0;
                if (info && info.firstDay >= 1 && info.firstDay <= 6) return 1;
            } catch (e) { /* unsupported locale or API -- fall through */ }
            return 1;
        }

        function buildWeekdayLabels(firstOffset) {
            // Reference week starting Sun 2024-01-07 lets us pick weekday names by locale.
            const labels = [];
            for (let i = 0; i < 7; i++) {
                const ref = new Date(2024, 0, 7 + ((i + firstOffset) % 7));
                labels.push(ref.toLocaleDateString(locale, { weekday: 'short' }));
            }
            return labels;
        }

        function renderMonthCalendar(days) {
            const daysMap = {};
            (days || []).forEach(day => {
                const taskCount = (day.scheduled_timed || []).length +
                                (day.scheduled_no_time || []).length +
                                (day.upcoming || []).length +
                                (day.overdue || []).length;
                daysMap[day.date] = taskCount > 0;
            });

            const target = shiftedToday ? parseLocalDate(shiftedToday) : new Date();
            const year = target.getFullYear();
            const month = target.getMonth();
            const firstDayOfMonth = new Date(year, month, 1);
            const lastDayOfMonth = new Date(year, month + 1, 0);

            const firstOffset = resolveFirstDayOffset();
            // JS getDay(): 0=Sun..6=Sat. Convert to leading-empty-cells count.
            const startDay = (firstDayOfMonth.getDay() - firstOffset + 7) % 7;

            const today = new Date();
            const todayStr = toIsoDate(today);

            let html = '<div class="calendar">';
            buildWeekdayLabels(firstOffset).forEach(label => {
                html += '<div class="calendar-header">' + escapeHtml(label) + '</div>';
            });

            const prevMonthLast = new Date(year, month, 0);
            const prevMonthDays = prevMonthLast.getDate();
            for (let i = startDay - 1; i >= 0; i--) {
                const day = prevMonthDays - i;
                const d = new Date(year, month - 1, day);
                const dateStr = toIsoDate(d);
                html += '<div class="calendar-day other-month" data-date="' + dateStr + '">' +
                       '<div class="day-number">' + day + '</div></div>';
            }

            for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
                const d = new Date(year, month, day);
                const dateStr = toIsoDate(d);
                const dayOfWeek = d.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isHol = isHoliday(dateStr);
                const hasTasks = daysMap[dateStr];
                const isToday = dateStr === todayStr;

                let classes = 'calendar-day';
                if (isWeekend) classes += ' weekend';
                if (isHol) classes += ' holiday';
                if (hasTasks) classes += ' has-tasks';
                if (isToday) classes += ' today';

                html += '<div class="' + classes + '" data-date="' + dateStr + '">' +
                       '<div class="day-number">' + day + '</div>' +
                       (hasTasks ? '<div class="task-indicator"></div>' : '') +
                       '</div>';
            }

            // Pad trailing cells up to the next full week boundary -- gives 4/5/6 rows naturally.
            const used = startDay + lastDayOfMonth.getDate();
            const trailingCells = (${CALENDAR_COLS} - (used % ${CALENDAR_COLS})) % ${CALENDAR_COLS};
            for (let i = 1; i <= trailingCells; i++) {
                const d = new Date(year, month + 1, i);
                const dateStr = toIsoDate(d);
                html += '<div class="calendar-day other-month" data-date="' + dateStr + '">' +
                       '<div class="day-number">' + i + '</div></div>';
            }

            html += '</div>';
            return html;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function navigate(offset) {
            // Remember the scroll position for the current anchor before
            // leaving it, so a later return to this anchor can restore it.
            rememberScroll(scrollHistory, shiftedToday, window.scrollY);
            const d = parseLocalDate(shiftedToday);
            if (offset === 0) {
                d.setTime(new Date().getTime());
            } else if (initialMode === 'day') {
                d.setDate(d.getDate() + offset);
            } else if (initialMode === 'week') {
                d.setDate(d.getDate() + offset * 7);
            } else if (initialMode === 'month') {
                d.setMonth(d.getMonth() + offset);
            }
            const newDate = toIsoDate(d);
            // Today is an explicit "snap to today" -- drop any remembered
            // scroll for that anchor so the update handler falls back to
            // scrollToWeekFocus() instead of restoring an old position.
            if (offset === 0) {
                delete scrollHistory[newDate];
            }
            vscode.postMessage({ command: 'navigate', date: newDate });
        }
        
        function renderModeSwitch() {
            const modes = [
                { id: 'day', label: 'Day' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
                { id: 'tasks', label: 'Tasks' }
            ];
            return '<span class="mode-switch">' +
                modes.map(m =>
                    '<button class="mode-btn' + (m.id === initialMode ? ' active' : '') +
                    '" data-mode="' + m.id + '">' + m.label + '</button>'
                ).join('') +
                '</span>';
        }

        function attachModeSwitchListeners() {
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-mode');
                    if (target && target !== initialMode) {
                        vscode.postMessage({ command: 'switchMode', mode: target });
                    }
                });
            });
        }

        function renderNavBar() {
            const navBar = document.getElementById('nav-bar');
            const dateEl = document.getElementById('current-date');
            const modeSwitchHtml = renderModeSwitch();
            const tagHtml = '<span class="tag-indicator" id="tag-indicator">Tag: ' + escapeHtml(currentTag) + '</span>';

            if (initialMode === 'tasks') {
                navBar.innerHTML = modeSwitchHtml + tagHtml;
                dateEl.textContent = '';
                dateEl.style.display = 'none';
            } else {
                const unit = initialMode === 'day' ? 'Day' : initialMode === 'week' ? 'Week' : 'Month';
                navBar.innerHTML =
                    modeSwitchHtml +
                    '<button class="nav-btn" id="btn-prev">← Prev ' + unit + '</button>' +
                    '<button class="nav-btn" id="btn-today">Today</button>' +
                    '<button class="nav-btn" id="btn-next">Next ' + unit + ' →</button>' +
                    tagHtml;

                const d = parseLocalDate(shiftedToday);
                const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
                const dayMonth = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
                const year = d.getFullYear();
                dateEl.textContent = weekday + ', ' + dayMonth + ' ' + year;
                dateEl.style.display = '';

                document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
                document.getElementById('btn-today').addEventListener('click', () => navigate(0));
                document.getElementById('btn-next').addEventListener('click', () => navigate(1));
            }

            attachModeSwitchListeners();
            document.getElementById('tag-indicator').addEventListener('click', () => {
                vscode.postMessage({ command: 'cycleTag' });
            });
        }
    </script>
</body>
</html>`;
    }
}
