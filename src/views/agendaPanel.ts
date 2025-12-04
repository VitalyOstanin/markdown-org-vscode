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
    private static refreshCallback?: () => Promise<void>;

    public static render(context: vscode.ExtensionContext, data: AgendaData, mode: string, refreshCallback?: () => Promise<void>) {
        if (refreshCallback) {
            AgendaPanel.refreshCallback = refreshCallback;
        }

        if (AgendaPanel.currentPanel) {
            AgendaPanel.currentPanel.webview.postMessage({ type: 'update', data, mode });
        } else {
            AgendaPanel.currentPanel = vscode.window.createWebviewPanel(
                'markdownOrgAgenda',
                `Agenda: ${mode}`,
                vscode.ViewColumn.Two,
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
            });

            AgendaPanel.currentPanel.webview.onDidReceiveMessage(async message => {
                if (message.command === 'openTask') {
                    const doc = await vscode.workspace.openTextDocument(message.file);
                    const pos = new vscode.Position(message.line - 1, 0);
                    await vscode.window.showTextDocument(doc, {
                        selection: new vscode.Range(pos, pos)
                    });
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
    }

    private static getHtmlContent(data: AgendaData, mode: string): string {
        const dataJson = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
        
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            font-family: 'Courier New', monospace; 
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
            line-height: 1.6;
        }
        .day-header {
            color: #569cd6;
            font-weight: bold;
            margin: 20px 0 5px 0;
        }
        .task-line {
            display: grid;
            grid-template-columns: auto 140px 60px 60px 1fr;
            gap: 8px;
            margin: 2px 0;
            cursor: pointer;
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
    <div id="content"></div>
    <script>
        const vscode = acquireVsCodeApi();
        const initialData = ${dataJson};
        const initialMode = ${JSON.stringify(mode)};
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
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
                const scrollPos = window.scrollY;
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
                html += '<div class="day-header">' + escapeHtml(formatDayHeader(day.date)) + '</div>';
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
            
            return '<div class="task-line" data-file="' + escapeHtml(task.file) + '" data-line="' + task.line + '">' +
                '<span class="todo-label">todo:</span>' +
                '<span>' + timeInfo + '</span>' +
                '<span class="' + statusClass + '">' + escapeHtml(status) + '</span>' +
                '<span class="' + priorityClass + '">' + escapeHtml(priority) + '</span>' +
                '<span>' + escapeHtml(task.heading) + '</span>' +
                '</div>';
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
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            return d.toLocaleDateString(undefined, options);
        }
        
        // Initial render
        const contentEl = document.getElementById('content');
        contentEl.innerHTML = initialMode === 'tasks' ? renderTasks(initialData) : renderAgenda(initialData);
        attachListeners();
    </script>
</body>
</html>`;
    }
}
