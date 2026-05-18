import * as vscode from 'vscode';
import {
    setTaskStatus,
    togglePriority,
    insertCreatedTimestamp,
    insertScheduledTimestamp,
    insertDeadlineTimestamp
} from './commands/taskStatus';
import { showAgenda, cycleTag } from './commands/agenda';
import { adjustTimestamp } from './commands/timestampEdit';
import { moveToArchive, promoteToMaintain } from './commands/moveHeading';
import { insertClockStart, insertClockFinish } from './commands/clock';
import { insertClockTable } from './commands/clocktable';
import { notifyError } from './utils/notify';
import { withErrorReporting } from './utils/orgCommandWrap';

function registerOrgCommand<A extends unknown[]>(
    context: vscode.ExtensionContext,
    name: string,
    handler: (...args: A) => unknown | Promise<unknown>
): void {
    const wrapped = withErrorReporting(name, (msg) => notifyError(msg), handler);
    context.subscriptions.push(vscode.commands.registerCommand(name, wrapped));
}

export function activate(context: vscode.ExtensionContext) {
    registerOrgCommand(context, 'markdown-org.setTodo', () => setTaskStatus('TODO'));
    registerOrgCommand(context, 'markdown-org.setDone', () => setTaskStatus('DONE'));
    registerOrgCommand(context, 'markdown-org.togglePriority', () => togglePriority());
    registerOrgCommand(context, 'markdown-org.insertCreated', () => insertCreatedTimestamp());
    registerOrgCommand(context, 'markdown-org.insertScheduled', () => insertScheduledTimestamp());
    registerOrgCommand(context, 'markdown-org.insertDeadline', () => insertDeadlineTimestamp());
    registerOrgCommand(context, 'markdown-org.insertClockStart', () => insertClockStart());
    registerOrgCommand(context, 'markdown-org.insertClockFinish', () => insertClockFinish());
    registerOrgCommand(context, 'markdown-org.insertClockTable', () => insertClockTable());
    registerOrgCommand(context, 'markdown-org.showAgendaDay', (date?: string) => showAgenda(context, 'day', date));
    registerOrgCommand(context, 'markdown-org.showAgendaWeek', (date?: string) => showAgenda(context, 'week', date));
    registerOrgCommand(context, 'markdown-org.showAgendaMonth', (date?: string) => showAgenda(context, 'month', date));
    registerOrgCommand(context, 'markdown-org.showTasks', (date?: string) => showAgenda(context, 'tasks', date));
    registerOrgCommand(context, 'markdown-org.timestampUp', () => adjustTimestamp(1));
    registerOrgCommand(context, 'markdown-org.timestampDown', () => adjustTimestamp(-1));
    registerOrgCommand(context, 'markdown-org.moveToArchive', () => moveToArchive());
    registerOrgCommand(context, 'markdown-org.promoteToMaintain', () => promoteToMaintain());
    registerOrgCommand(context, 'markdown-org.cycleTag', () => cycleTag(context));
}

export function deactivate() {}
