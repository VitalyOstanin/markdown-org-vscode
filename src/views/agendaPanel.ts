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
    private static currentTag?: string;

    public static render(context: vscode.ExtensionContext, data: AgendaData, mode: string, date: string | undefined, refreshCallback?: (date?: string, userInitiated?: boolean) => Promise<void>, userInitiated: boolean = true, currentTag?: string, holidays?: string[]) {
        if (refreshCallback) {
            AgendaPanel.refreshCallback = refreshCallback;
        }
        AgendaPanel.currentMode = mode;
        AgendaPanel.currentTag = currentTag;
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        AgendaPanel.currentDate = date || localDate;
        const locale = vscode.workspace.getConfiguration('markdown-org').get<string>('dateLocale', 'en-US');

        if (AgendaPanel.currentPanel) {
            if (userInitiated) {
                AgendaPanel.currentPanel.reveal(vscode.ViewColumn.One);
            }
            AgendaPanel.currentPanel.webview.postMessage({ type: 'update', data, mode, date, currentTag });
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
                    if (message.switchToDay) {
                        AgendaPanel.currentPanel?.dispose();
                        const { showAgenda } = require('../commands/agenda');
                        await showAgenda(context, 'day', message.date);
                    } else {
                        AgendaPanel.refreshCallback?.(message.date, true);
                    }
                }
            });

            AgendaPanel.currentPanel.webview.html = this.getHtmlContent(data, mode, locale, currentTag || 'ALL', holidays || []);
            
            AgendaPanel.currentPanel.webview.postMessage({
                command: 'init',
                data: data,
                mode: mode,
                locale: locale,
                currentDate: AgendaPanel.currentDate,
                currentTag: currentTag || 'ALL',
                holidays: holidays || []
            });
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

    public static refreshWithCurrentTag() {
        if (AgendaPanel.refreshCallback) {
            AgendaPanel.refreshCallback(AgendaPanel.currentDate, false);
        }
    }

    private static getHtmlContent(data: AgendaData, mode: string, locale: string, currentTag: string, holidays: string[]): string {
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
            color: #4fc1ff;
            font-weight: bold;
            margin: 0 10px;
        }
        .tag-indicator {
            color: #dcdcaa;
            font-weight: bold;
            margin-left: auto;
        }
        .day-header {
            color: #4fc1ff;
            font-weight: bold;
            margin: 20px 0 5px 0;
            display: grid;
            grid-template-columns: 120px 30px 1fr;
            column-gap: 1ch;
        }
        .task-line {
            display: grid;
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
        .priority-b { color: #dcdcaa; }
        .priority-c { color: #4ec9b0; }
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
    <div id="content"></div>
    <script>
        const vscode = acquireVsCodeApi();
        let initialData = [];
        let initialMode = '';
        let locale = '';
        let currentDate = '';
        let currentTag = '';
        let holidays = [];
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'init') {
                initialData = message.data;
                initialMode = message.mode;
                locale = message.locale;
                currentDate = message.currentDate;
                currentTag = message.currentTag;
                holidays = message.holidays;
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
            } else if (message.type === 'update') {
                if (message.date) {
                    currentDate = message.date;
                }
                if (message.currentTag) {
                    currentTag = message.currentTag;
                }
                initialData = message.data;
                const scrollPos = window.scrollY;
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
                window.scrollTo(0, scrollPos);
            }
        });
        
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
                const taskLine = e.target.closest('.task-line');
                if (taskLine) {
                    vscode.postMessage({
                        command: 'openTask',
                        file: taskLine.getAttribute('data-file'),
                        line: parseInt(taskLine.getAttribute('data-line'))
                    });
                }
            });
        }
        
        function renderAgenda(days) {
            let html = '';
            days.forEach(day => {
                html += '<div class="day-header">' + formatDayHeader(day.date) + '</div>';
                (day.overdue || []).forEach(task => html += renderTask(task, task.days_offset, 'overdue'));
                (day.scheduled_timed || []).forEach(task => html += renderTask(task, task.days_offset));
                (day.scheduled_no_time || []).forEach(task => html += renderTask(task, task.days_offset));
                (day.upcoming || []).forEach(task => html += renderTask(task, task.days_offset, 'upcoming'));
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
                html += '<div class="day-header"><span>' + escapeHtml(header) + '</span></div>';
                filtered.forEach(task => html += renderTask(task));
            });
            return html;
        }
        
        function formatDayHeader(date) {
            const d = new Date(date);
            const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
            const dayMonth = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
            const year = d.toLocaleDateString(locale, { year: 'numeric' });
            const parts = dayMonth.split(' ');
            const day = parts[0];
            const month = parts.slice(1).join(' ');
            return '<span>' + weekday + '</span><span style="text-align: right">' + day + '</span><span>' + month + ' ' + year + '</span>';
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
            const headingClass = task.timestamp_type === 'DEADLINE' ? 'deadline-heading' : '';
            
            return '<div class="task-line" data-file="' + escapeHtml(task.file) + '" data-line="' + task.line + '">' +
                '<span class="todo-label">todo:</span>' +
                '<span>' + timeInfo + '</span>' +
                '<span class="' + statusClass + '">' + escapeHtml(status) + '</span>' +
                '<span class="' + priorityClass + '">' + escapeHtml(priority) + '</span>' +
                '<span class="' + headingClass + '">' + escapeHtml(task.heading) + '</span>' +
                '<span class="' + dateClass + '">' + dateDisplay + '</span>' +
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
                if (type && type !== 'PLAIN' && type !== 'SCHEDULED') {
                    const typeClass = type === 'DEADLINE' ? 'timestamp-deadline' : 'timestamp-type';
                    return '<span class="time-display">' + escapeHtml(task.timestamp_time) + '</span>...... <span class="' + typeClass + '">' + escapeHtml(type) + ':</span>';
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
                return '<span class="' + typeClass + '">' + escapeHtml(type) + ':</span>';
            }
            return '';
        }
        
        function renderMonthCalendar(days) {
            const daysMap = {};
            days.forEach(day => {
                const taskCount = (day.scheduled_timed || []).length + 
                                (day.scheduled_no_time || []).length + 
                                (day.upcoming || []).length;
                daysMap[day.date] = taskCount > 0;
            });
            
            const firstDay = new Date(days[0].date);
            const year = firstDay.getFullYear();
            const month = firstDay.getMonth();
            const firstDayOfMonth = new Date(year, month, 1);
            const lastDayOfMonth = new Date(year, month + 1, 0);
            
            let startDay = firstDayOfMonth.getDay();
            startDay = startDay === 0 ? 6 : startDay - 1;
            
            const today = new Date();
            const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
            
            let html = '<div class="calendar">';
            const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            weekdays.forEach(day => {
                html += '<div class="calendar-header">' + day + '</div>';
            });
            
            const prevMonthDays = new Date(year, month, 0).getDate();
            for (let i = startDay - 1; i >= 0; i--) {
                const day = prevMonthDays - i;
                html += '<div class="calendar-day other-month"><div class="day-number">' + day + '</div></div>';
            }
            
            for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
                const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                const d = new Date(year, month, day);
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
            
            const remainingCells = 42 - (startDay + lastDayOfMonth.getDate());
            for (let i = 1; i <= remainingCells; i++) {
                html += '<div class="calendar-day other-month"><div class="day-number">' + i + '</div></div>';
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
                navBar.innerHTML = '<span class="tag-indicator">Tag: ' + escapeHtml(currentTag) + '</span>';
                return;
            }
            const unit = initialMode === 'day' ? 'Day' : initialMode === 'week' ? 'Week' : 'Month';
            const d = new Date(currentDate);
            const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
            const dayMonth = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
            const year = d.getFullYear();
            const dateStr = weekday + ', ' + dayMonth + ' ' + year;
            navBar.innerHTML = 
                '<button class="nav-btn" id="btn-prev">← Prev ' + unit + '</button>' +
                '<button class="nav-btn" id="btn-today">Today</button>' +
                '<button class="nav-btn" id="btn-next">Next ' + unit + ' →</button>' +
                '<span class="nav-date">' + escapeHtml(dateStr) + '</span>' +
                '<span class="tag-indicator">Tag: ' + escapeHtml(currentTag) + '</span>';
            
            document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
            document.getElementById('btn-today').addEventListener('click', () => navigate(0));
            document.getElementById('btn-next').addEventListener('click', () => navigate(1));
        }
    </script>
</body>
</html>`;
    }
}
