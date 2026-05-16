import * as vscode from 'vscode';
import { setTaskStatus, togglePriority, insertCreatedTimestamp, insertScheduledTimestamp, insertDeadlineTimestamp } from './commands/taskStatus';
import { showAgenda, cycleTag } from './commands/agenda';
import { adjustTimestamp } from './commands/timestampEdit';
import { moveToArchive, promoteToMaintain } from './commands/moveHeading';
import { insertClockStart, insertClockFinish } from './commands/clock';
import { insertClockTable } from './commands/clocktable';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('markdown-org.setTodo', () => setTaskStatus('TODO')),
        vscode.commands.registerCommand('markdown-org.setDone', () => setTaskStatus('DONE')),
        vscode.commands.registerCommand('markdown-org.togglePriority', () => togglePriority()),
        vscode.commands.registerCommand('markdown-org.insertCreated', () => insertCreatedTimestamp()),
        vscode.commands.registerCommand('markdown-org.insertScheduled', () => insertScheduledTimestamp()),
        vscode.commands.registerCommand('markdown-org.insertDeadline', () => insertDeadlineTimestamp()),
        vscode.commands.registerCommand('markdown-org.insertClockStart', () => insertClockStart()),
        vscode.commands.registerCommand('markdown-org.insertClockFinish', () => insertClockFinish()),
        vscode.commands.registerCommand('markdown-org.insertClockTable', () => insertClockTable()),
        vscode.commands.registerCommand('markdown-org.showAgendaDay', (date?: string) => showAgenda(context, 'day', date)),
        vscode.commands.registerCommand('markdown-org.showAgendaWeek', (date?: string) => showAgenda(context, 'week', date)),
        vscode.commands.registerCommand('markdown-org.showAgendaMonth', (date?: string) => showAgenda(context, 'month', date)),
        vscode.commands.registerCommand('markdown-org.showTasks', (date?: string) => showAgenda(context, 'tasks', date)),
        vscode.commands.registerCommand('markdown-org.timestampUp', () => adjustTimestamp(1)),
        vscode.commands.registerCommand('markdown-org.timestampDown', () => adjustTimestamp(-1)),
        vscode.commands.registerCommand('markdown-org.moveToArchive', () => moveToArchive()),
        vscode.commands.registerCommand('markdown-org.promoteToMaintain', () => promoteToMaintain()),
        vscode.commands.registerCommand('markdown-org.cycleTag', () => cycleTag(context))
    );
}

export function deactivate() {}
