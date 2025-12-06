import * as vscode from 'vscode';

interface Task {
    file: string;
    line: number;
    heading: string;
    content: string;
    task_type?: string;
    priority?: string;
    timestamp?: string;
    timestamp_date?: string;
    timestamp_time?: string;
    timestamp_type?: string;
}

interface TaskWithOffset extends Task {
    days_offset?: number;
}

interface DayAgenda {
    date: string;
    overdue: TaskWithOffset[];
    scheduled_timed: TaskWithOffset[];
    scheduled_no_time: TaskWithOffset[];
    upcoming: TaskWithOffset[];
}

type AgendaData = DayAgenda[] | Task[];

export class AgendaPanel {
    private static currentPanel?: vscode.WebviewPanel;
    private static watcher?: vscode.FileSystemWatcher;
    private static debounceTimer?: NodeJS.Timeout;
    private static refreshCallback?: (date?: string, userInitiated?: boolean) => Promise<void>;
    private static currentDate?: string;
    private static currentMode?: string;
    private static dayCheckInterval?: NodeJS.Timeout;
    private static lastCheckedDay?: string;

    public static render(context: vscode.ExtensionContext, data: AgendaData, mode: string, date: string | undefined, refreshCallback?: (date?: string, userInitiated?: boolean) => Promise<void>, userInitiated: boolean = true) {
        if (refreshCallback) {
            AgendaPanel.refreshCallback = refreshCallback;
        }
        AgendaPanel.currentMode = mode;
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        AgendaPanel.currentDate = date || localDate;

        if (AgendaPanel.currentPanel) {
            if (userInitiated) {
                AgendaPanel.currentPanel.reveal(vscode.ViewColumn.One);
            }
            AgendaPanel.currentPanel.webview.postMessage({ type: 'update', data, mode, date });
        } else {
            AgendaPanel.currentPanel = vscode.window.createWebviewPanel(
                'markdownOrgAgenda',
                `Agenda: ${mode}`,
                vscode.ViewColumn.One,
                { 
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            AgendaPanel.currentPanel.onDidDispose(() => {
                AgendaPanel.currentPanel = undefined;
                AgendaPanel.watcher?.dispose();
                AgendaPanel.watcher = undefined;
                AgendaPanel.refreshCallback = undefined;
                if (AgendaPanel.debounceTimer) {
                    clearTimeout(AgendaPanel.debounceTimer);
                    AgendaPanel.debounceTimer = undefined;
                }
                if (AgendaPanel.dayCheckInterval) {
                    clearInterval(AgendaPanel.dayCheckInterval);
                    AgendaPanel.dayCheckInterval = undefined;
                }
            });

            AgendaPanel.currentPanel.webview.onDidReceiveMessage(async message => {
                if (message.command === 'openTask') {
                    const doc = await vscode.workspace.openTextDocument(message.file);
                    const pos = new vscode.Position(message.line - 1, 0);
                    await vscode.window.showTextDocument(doc, {
                        selection: new vscode.Range(pos, pos)
                    });
                } else if (message.command === 'navigate') {
                    AgendaPanel.refreshCallback?.(message.date, true);
                }
            });

            AgendaPanel.currentPanel.webview.html = this.getHtmlContent(data, mode);
        }

        if (!AgendaPanel.watcher && refreshCallback) {
            AgendaPanel.watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
            
            const triggerRefresh = () => {
                if (AgendaPanel.debounceTimer) {
                    clearTimeout(AgendaPanel.debounceTimer);
                }
                AgendaPanel.debounceTimer = setTimeout(() => {
                    AgendaPanel.refreshCallback?.();
                }, 500);
            };

            AgendaPanel.watcher.onDidChange(triggerRefresh);
            AgendaPanel.watcher.onDidCreate(triggerRefresh);
            AgendaPanel.watcher.onDidDelete(triggerRefresh);
        }

        if (!AgendaPanel.dayCheckInterval && refreshCallback) {
            const today = new Date();
            AgendaPanel.lastCheckedDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            
            AgendaPanel.dayCheckInterval = setInterval(() => {
                const now = new Date();
                const currentDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                if (currentDay !== AgendaPanel.lastCheckedDay) {
                    AgendaPanel.lastCheckedDay = currentDay;
                    AgendaPanel.refreshCallback?.();
                }
            }, 60000);
        }
    }

    private static getHtmlContent(data: AgendaData, mode: string): string {
        const dataJson = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const currentDate = AgendaPanel.currentDate || localDate;
        
        return `<!DOCTYPE html>
<html>
<head>
    <style>
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
        .nav-date {
            color: #569cd6;
            font-weight: bold;
            margin: 0 10px;
        }
        .day-header {
            color: #569cd6;
            font-weight: bold;
            margin: 20px 0 5px 0;
            display: grid;
            grid-template-columns: 120px 30px 1fr;
            column-gap: 1ch;
        }
        .task-line {
            display: grid;
            grid-template-columns: auto 140px 60px 60px 1fr;
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
        .priority-b { color: #dcdcaa; }
        .priority-c { color: #4ec9b0; }
        .time-display { color: #4fc1ff; font-weight: bold; }
        .timestamp-type { font-weight: bold; }
    </style>
</head>
<body>
    <div class="nav-bar" id="nav-bar"></div>
    <div id="content"></div>
    <script>
        const vscode = acquireVsCodeApi();
        const initialData = ${dataJson};
        const initialMode = ${JSON.stringify(mode)};
        let currentDate = ${JSON.stringify(currentDate)};
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function navigate(offset) {
            const d = new Date(currentDate);
            if (offset === 0) {
                d.setTime(new Date().getTime());
            } else if (initialMode === 'day') {
                d.setDate(d.getDate() + offset);
            } else if (initialMode === 'week') {
                d.setDate(d.getDate() + offset * 7);
            } else if (initialMode === 'month') {
                d.setMonth(d.getMonth() + offset);
            }
            const newDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            vscode.postMessage({ command: 'navigate', date: newDate });
        }
        
        function renderNavBar() {
            const navBar = document.getElementById('nav-bar');
            if (initialMode === 'tasks') {
                navBar.innerHTML = '';
                return;
            }
            const unit = initialMode === 'day' ? 'Day' : initialMode === 'week' ? 'Week' : 'Month';
            const d = new Date(currentDate);
            const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
            const dayMonth = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
            const year = d.getFullYear();
            const dateStr = weekday + ', ' + dayMonth + ' ' + year;
            navBar.innerHTML = 
                '<button class="nav-btn" onclick="navigate(-1)">← Prev ' + unit + '</button>' +
                '<button class="nav-btn" onclick="navigate(0)">Today</button>' +
                '<button class="nav-btn" onclick="navigate(1)">Next ' + unit + ' →</button>' +
                '<span class="nav-date">' + escapeHtml(dateStr) + '</span>';
        }
        
        function attachListeners() {
            document.querySelectorAll('.task-line').forEach(el => {
                el.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'openTask',
                        file: el.dataset.file,
                        line: parseInt(el.dataset.line)
                    });
                });
            });
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                if (message.date) {
                    currentDate = message.date;
                }
                const scrollPos = window.scrollY;
                renderNavBar();
                const contentEl = document.getElementById('content');
                const newContent = message.mode === 'tasks' 
                    ? renderTasks(message.data) 
                    : renderAgenda(message.data);
                contentEl.innerHTML = newContent;
                attachListeners();
                window.scrollTo(0, scrollPos);
            }
        });
        
        function renderAgenda(days) {
            let html = '';
            days.forEach(day => {
                html += '<div class="day-header">' + formatDayHeader(day.date) + '</div>';
                (day.overdue || []).forEach(task => html += renderTask(task, task.days_offset));
                (day.scheduled_timed || []).forEach(task => html += renderTask(task, task.days_offset));
                (day.scheduled_no_time || []).forEach(task => html += renderTask(task, task.days_offset));
                (day.upcoming || []).forEach(task => html += renderTask(task, task.days_offset));
            });
            return html;
        }
        
        function renderTasks(tasks) {
            const priorities = ['A', 'B', 'C', ''];
            let html = '';
            priorities.forEach(priority => {
                const filtered = tasks.filter(t => (t.priority || '') === priority);
                if (filtered.length === 0) return;
                const header = priority ? 'Priority [#' + priority + ']' : 'No priority';
                html += '<div class="day-header">' + escapeHtml(header) + '</div>';
                filtered.forEach(task => html += renderTask(task));
            });
            return html;
        }
        
        function renderTask(task, daysOffset) {
            const timeInfo = getTimeInfo(task, daysOffset);
            const status = task.task_type || '';
            const priority = task.priority ? '[#' + task.priority + ']' : '';
            const priorityClass = task.priority ? 'priority-' + task.priority.toLowerCase() : '';
            const statusClass = status === 'TODO' ? 'todo-keyword' : status === 'DONE' ? 'done-keyword' : '';
            
            const titleAttr = (daysOffset !== undefined && daysOffset !== 0 && task.timestamp_date) 
                ? ' title="' + formatDateForTitle(task.timestamp_date) + '"' 
                : '';
            
            return '<div class="task-line" data-file="' + escapeHtml(task.file) + '" data-line="' + task.line + '">' +
                '<span class="todo-label">todo:</span>' +
                '<span' + titleAttr + '>' + timeInfo + '</span>' +
                '<span class="' + statusClass + '">' + escapeHtml(status) + '</span>' +
                '<span class="' + priorityClass + '">' + escapeHtml(priority) + '</span>' +
                '<span>' + escapeHtml(task.heading) + '</span>' +
                '</div>';
        }
        
        function formatDateForTitle(dateStr) {
            const d = new Date(dateStr);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return day + '.' + month + '.' + year;
        }
        
        function getTimeInfo(task, daysOffset) {
            if (task.timestamp_time) {
                const type = task.timestamp_type;
                if (type && type !== 'PLAIN') {
                    return '<span class="time-display">' + escapeHtml(task.timestamp_time) + '</span>...... <span class="timestamp-type">' + escapeHtml(type) + ':</span>';
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
            if (type && type !== 'PLAIN') {
                return '<span class="timestamp-type">' + escapeHtml(type) + ':</span>';
            }
            return '<span class="timestamp-type">SCHEDULED:</span>';
        }
        
        function formatDayHeader(date) {
            const d = new Date(date);
            const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
            const dayMonth = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
            const year = d.toLocaleDateString('ru-RU', { year: 'numeric' });
            const [day, month] = dayMonth.split(' ');
            return '<span>' + weekday + '</span><span style="text-align: right">' + day + '</span><span>' + month + ' ' + year + '</span>';
        }
        
        // Initial render
        renderNavBar();
        const contentEl = document.getElementById('content');
        contentEl.innerHTML = initialMode === 'tasks' ? renderTasks(initialData) : renderAgenda(initialData);
        attachListeners();
    </script>
</body>
</html>`;
    }
}
