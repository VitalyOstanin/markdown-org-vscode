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

export class AgendaPanel {
    private static currentPanel?: vscode.WebviewPanel;

    public static render(context: vscode.ExtensionContext, data: DayAgenda[] | Task[], mode: string) {
        if (AgendaPanel.currentPanel) {
            AgendaPanel.currentPanel.reveal();
            AgendaPanel.currentPanel.webview.html = this.getHtmlContent(data, mode);
            return;
        }
        
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

    private static getHtmlContent(data: DayAgenda[] | Task[], mode: string): string {
        const content = mode === 'tasks' 
            ? this.renderTasks(data as Task[]) 
            : this.renderAgenda(data as DayAgenda[]);
        
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
    ${content}
    <script>
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('.task-line').forEach(el => {
            el.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'openTask',
                    file: el.dataset.file,
                    line: parseInt(el.dataset.line)
                });
            });
        });
    </script>
</body>
</html>`;
    }

    private static renderAgenda(days: DayAgenda[]): string {
        if (!Array.isArray(days)) {
            return '<div>Invalid data format</div>';
        }
        let html = '';
        days.forEach(day => {
            html += `<div class="day-header">${this.formatDayHeader(day.date)}</div>`;
            
            (day.overdue || []).forEach(task => html += this.renderTask(task));
            (day.scheduled_timed || []).forEach(task => html += this.renderTask(task));
            (day.scheduled_no_time || []).forEach(task => html += this.renderTask(task));
            (day.upcoming || []).forEach(task => html += this.renderTask(task));
        });
        return html;
    }

    private static renderTask(task: TaskWithOffset): string {
        const timeInfo = this.getTimeInfo(task, task.days_offset);
        const status = task.task_type || '';
        const priority = task.priority ? `[#${task.priority}]` : '';
        const priorityClass = task.priority ? `priority-${task.priority.toLowerCase()}` : '';
        const statusClass = status === 'TODO' ? 'todo-keyword' : status === 'DONE' ? 'done-keyword' : '';
        
        return `<div class="task-line" data-file="${task.file}" data-line="${task.line}">
            <span class="todo-label">todo:</span>
            <span>${timeInfo}</span>
            <span class="${statusClass}">${status}</span>
            <span class="${priorityClass}">${priority}</span>
            <span>${task.heading}</span>
        </div>`;
    }

    private static getTimeInfo(task: Task, daysOffset?: number): string {
        if (task.timestamp_time) {
            const type = task.timestamp_type;
            if (type && type !== 'PLAIN') {
                return `<span class="time-display">${task.timestamp_time}</span>...... <span class="timestamp-type">${type}:</span>`;
            }
            return `<span class="time-display">${task.timestamp_time}</span>......`;
        }

        if (daysOffset !== undefined) {
            if (daysOffset < 0) {
                const daysAgo = Math.abs(daysOffset);
                if (task.timestamp_type === 'SCHEDULED') {
                    return `Sched.${daysAgo}x:`;
                }
                return `${daysAgo} d. ago:`;
            }
            if (daysOffset > 0) {
                return `In ${daysOffset} d.:`;
            }
        }

        const type = task.timestamp_type;
        if (type && type !== 'PLAIN') {
            return `<span class="timestamp-type">${type}:</span>`;
        }
        return `<span class="timestamp-type">SCHEDULED:</span>`;
    }

    private static renderTasks(tasks: Task[]): string {
        const priorities = ['A', 'B', 'C', ''];
        let html = '';

        priorities.forEach(priority => {
            const filtered = tasks.filter(t => (t.priority || '') === priority);
            if (filtered.length === 0) return;

            const header = priority ? `Priority [#${priority}]` : 'No priority';
            html += `<div class="day-header">${header}</div>`;
            filtered.forEach(task => {
                const status = task.task_type || '';
                const pri = task.priority ? `[#${task.priority}]` : '';
                const priorityClass = task.priority ? `priority-${task.priority.toLowerCase()}` : '';
                const statusClass = status === 'TODO' ? 'todo-keyword' : status === 'DONE' ? 'done-keyword' : '';
                
                html += `<div class="task-line" data-file="${task.file}" data-line="${task.line}">
                    <span class="todo-label">todo:</span>
                    <span></span>
                    <span class="${statusClass}">${status}</span>
                    <span class="${priorityClass}">${pri}</span>
                    <span>${task.heading}</span>
                </div>`;
            });
        });
        return html;
    }

    private static formatDayHeader(date: string): string {
        const d = new Date(date);
        const options: Intl.DateTimeFormatOptions = { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
        };
        return d.toLocaleDateString(undefined, options);
    }
}
