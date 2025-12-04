import * as vscode from 'vscode';
import { setTaskStatus, togglePriority, insertCreatedTimestamp, insertScheduledTimestamp, insertDeadlineTimestamp } from './commands/taskStatus';
import { showAgenda } from './commands/agenda';
import { adjustTimestamp } from './commands/timestampEdit';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('markdown-org.setTodo', () => setTaskStatus('TODO')),
        vscode.commands.registerCommand('markdown-org.setDone', () => setTaskStatus('DONE')),
        vscode.commands.registerCommand('markdown-org.togglePriority', () => togglePriority()),
        vscode.commands.registerCommand('markdown-org.insertCreated', () => insertCreatedTimestamp()),
        vscode.commands.registerCommand('markdown-org.insertScheduled', () => insertScheduledTimestamp()),
        vscode.commands.registerCommand('markdown-org.insertDeadline', () => insertDeadlineTimestamp()),
        vscode.commands.registerCommand('markdown-org.showAgendaDay', () => showAgenda(context, 'day')),
        vscode.commands.registerCommand('markdown-org.showAgendaWeek', () => showAgenda(context, 'week')),
        vscode.commands.registerCommand('markdown-org.showTasks', () => showAgenda(context, 'tasks')),
        vscode.commands.registerCommand('markdown-org.timestampUp', () => adjustTimestamp(1)),
        vscode.commands.registerCommand('markdown-org.timestampDown', () => adjustTimestamp(-1))
    );
}

export function deactivate() {}
