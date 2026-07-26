import * as vscode from 'vscode';
import {
    setTaskStatus,
    setCancelled,
    togglePriority,
    insertCreatedTimestamp,
    insertScheduledTimestamp,
    insertDeadlineTimestamp
} from './commands/taskStatus';
import { showAgenda, cycleTag, setTag } from './commands/agenda';
import { AgendaPanel } from './views/agendaPanel';
import { adjustTimestamp, toggleTimestampActive } from './commands/timestampEdit';
import { moveToArchive, promoteToMaintain } from './commands/moveHeading';
import { insertClockStart, insertClockFinish } from './commands/clock';
import { insertClockTable } from './commands/clocktable';
import { connectGcal, disconnectGcal, selectCalendar, syncNow, registerGcalSaveTrigger } from './commands/gcalSync';
import { notifyError } from './utils/notify';
import { withErrorReporting } from './utils/orgCommandWrap';
import { registerBracketDiagnostics } from './diagnostics/timestampBrackets';
import { registerTimestampAdjustableContext } from './commands/timestampAdjustableContext';

function registerOrgCommand<A extends unknown[]>(
    context: vscode.ExtensionContext,
    name: string,
    // `unknown` already covers a returned promise; spelling both out is
    // redundant (and flagged as such by no-redundant-type-constituents).
    handler: (...args: A) => unknown
): void {
    const wrapped = withErrorReporting(name, (msg) => notifyError(msg), handler);
    context.subscriptions.push(vscode.commands.registerCommand(name, wrapped));
}

export function activate(context: vscode.ExtensionContext) {
    registerOrgCommand(context, 'markdown-org.setTodo', () => setTaskStatus('TODO'));
    registerOrgCommand(context, 'markdown-org.setDone', () => setTaskStatus('DONE'));
    registerOrgCommand(context, 'markdown-org.setCancelled', () => setCancelled());
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
    // Agenda view history (browser-style Back/Forward over {mode, date} states).
    // Alt+Shift+- / Alt+Shift+= reach these through contributed keybindings gated
    // on `markdown-org.agendaFocused`; the webview does not capture the chords
    // itself (see the note in agendaClient.ts), so they stay reassignable.
    registerOrgCommand(context, 'markdown-org.agendaBack', () => AgendaPanel.goBack());
    registerOrgCommand(context, 'markdown-org.agendaForward', () => AgendaPanel.goForward());
    registerOrgCommand(context, 'markdown-org.timestampUp', () => adjustTimestamp(1));
    registerOrgCommand(context, 'markdown-org.timestampDown', () => adjustTimestamp(-1));
    registerOrgCommand(context, 'markdown-org.toggleTimestampActive', () => toggleTimestampActive());
    registerOrgCommand(context, 'markdown-org.moveToArchive', () => moveToArchive());
    registerOrgCommand(context, 'markdown-org.promoteToMaintain', () => promoteToMaintain());
    registerOrgCommand(context, 'markdown-org.cycleTag', () => cycleTag(context));
    // Internal: invoked by the agenda tag dropdown with the picked tag. Not in
    // package.json contributes.commands, so it stays out of the command palette
    // (it is meaningless without the tag argument).
    registerOrgCommand(context, 'markdown-org.setTag', (tag?: string) => setTag(context, tag ?? 'ALL'));
    registerOrgCommand(context, 'markdown-org.gcalSync.connect', () => connectGcal(context));
    registerOrgCommand(context, 'markdown-org.gcalSync.disconnect', () => disconnectGcal(context));
    registerOrgCommand(context, 'markdown-org.gcalSync.selectCalendar', () => selectCalendar(context));
    registerOrgCommand(context, 'markdown-org.gcalSync.syncNow', () => syncNow(context));

    registerBracketDiagnostics(context);
    registerTimestampAdjustableContext(context);
    registerGcalSaveTrigger(context);
}

export function deactivate() {}
