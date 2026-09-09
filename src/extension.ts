import * as vscode from 'vscode';
import {
    setTaskStatus,
    setCancelled,
    togglePriority,
    setPriority,
    insertCreatedTimestamp,
    insertScheduledTimestamp,
    insertDeadlineTimestamp,
    insertPlainTimestamp
} from './commands/taskStatus';
import {
    showAgenda,
    cycleTag,
    setTag,
    cycleAgendaHeaderMode,
    cycleAgendaGrouping,
    showTagDictionary
} from './commands/agenda';
import { AgendaPanel } from './views/agendaPanel';
import { DocsPanel } from './views/docsPanel';
import { adjustTimestamp, toggleTimestampActive } from './commands/timestampEdit';
import { agendaFind } from './commands/agendaFind';
import { moveToArchive, promoteToMaintain } from './commands/moveHeading';
import { cancelOccurrenceCommand, moveOccurrenceCommand } from './commands/occurrence';
import { insertClockStart, insertClockFinish } from './commands/clock';
import { insertClockTable } from './commands/clocktable';
import { editTaskFromPhrase, insertTaskFromPhrase } from './commands/phraseTask';
import { connectGcal, disconnectGcal, selectCalendar, syncNow, registerGcalSaveTrigger } from './commands/gcalSync';
import { notifyError } from './utils/notify';
import { withErrorReporting } from './utils/orgCommandWrap';
import { registerBracketDiagnostics } from './diagnostics/timestampBrackets';
import { registerMovedDiagnostics } from './diagnostics/movedLineDiagnostics';
import { registerOrgHighlight } from './decorations/orgHighlight';
import { registerTimestampAdjustableContext } from './commands/timestampAdjustableContext';
import { openNotesRepositories } from './utils/git/gitApi';
import { resolveAgendaDirectories } from './utils/agendaDirectories';

function registerOrgCommand(
    context: vscode.ExtensionContext,
    name: string,
    // `unknown` already covers a returned promise; spelling both out is
    // redundant (and flagged as such by no-redundant-type-constituents).
    handler: (...args: never[]) => unknown
): void {
    const wrapped = withErrorReporting(name, (msg) => notifyError(msg), handler);
    context.subscriptions.push(vscode.commands.registerCommand(name, wrapped));
}

/**
 * The directories the agenda would sweep, as the settings name them now.
 *
 * Read again on every call rather than kept: the list is a setting, and the
 * one caller runs when it changes.
 */
function notesDirectories(): string[] {
    const config = vscode.workspace.getConfiguration('markdown-org');
    return resolveAgendaDirectories(
        config.get<string[]>('workspaceDirs'),
        config.get<string>('workspaceDir'),
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    );
}

/**
 * Let the Git extension know about the notes, at activation and afterwards.
 *
 * Without this the git marks in a note appear only once the agenda has been
 * opened, because that is what opened the repository — see
 * {@link openNotesRepositories}. Not awaited: the opening spawns a `git
 * rev-parse` per directory, and nothing in the activation path depends on the
 * answer.
 */
function primeNotesRepositories(context: vscode.ExtensionContext): void {
    void openNotesRepositories(notesDirectories());
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (
                event.affectsConfiguration('markdown-org.workspaceDirs') ||
                event.affectsConfiguration('markdown-org.workspaceDir')
            ) {
                void openNotesRepositories(notesDirectories());
            }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void openNotesRepositories(notesDirectories());
        })
    );
}

export function activate(context: vscode.ExtensionContext) {
    registerOrgCommand(context, 'markdown-org.setTodo', () => setTaskStatus('TODO'));
    registerOrgCommand(context, 'markdown-org.setDone', () => setTaskStatus('DONE'));
    registerOrgCommand(context, 'markdown-org.setCancelled', () => setCancelled());
    registerOrgCommand(context, 'markdown-org.togglePriority', () => togglePriority());
    registerOrgCommand(context, 'markdown-org.setPriority', () => setPriority());
    registerOrgCommand(context, 'markdown-org.insertCreated', () => insertCreatedTimestamp());
    registerOrgCommand(context, 'markdown-org.insertScheduled', () => insertScheduledTimestamp());
    registerOrgCommand(context, 'markdown-org.insertDeadline', () => insertDeadlineTimestamp());
    registerOrgCommand(context, 'markdown-org.insertTimestamp', () => insertPlainTimestamp());
    registerOrgCommand(context, 'markdown-org.insertTaskFromPhrase', () => insertTaskFromPhrase());
    registerOrgCommand(context, 'markdown-org.editTaskFromPhrase', () => editTaskFromPhrase());
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
    // F3 / Shift+F3 over the panel's find widget. Bound to commands of our own
    // rather than straight to the built-in webview find actions: those are
    // registered with a keybinding on Enter and a condition that holds only
    // while the widget has the focus, and a contributed binding gated on the
    // widget's own context key did not fire.
    registerOrgCommand(context, 'markdown-org.agendaFindNext', () => agendaFind('next'));
    registerOrgCommand(context, 'markdown-org.agendaFindPrevious', () => agendaFind('previous'));
    registerOrgCommand(context, 'markdown-org.timestampUp', () => adjustTimestamp(1));
    registerOrgCommand(context, 'markdown-org.timestampDown', () => adjustTimestamp(-1));
    registerOrgCommand(context, 'markdown-org.toggleTimestampActive', () => toggleTimestampActive());
    registerOrgCommand(context, 'markdown-org.moveToArchive', () => moveToArchive());
    registerOrgCommand(context, 'markdown-org.promoteToMaintain', () => promoteToMaintain());
    // The day comes from the agenda, which knows which occurrence the row it
    // was invoked on stands for; from the palette there is none and the boxes
    // open on the day the series is planned for.
    registerOrgCommand(context, 'markdown-org.cancelOccurrence', (date?: string) => cancelOccurrenceCommand(date));
    registerOrgCommand(context, 'markdown-org.moveOccurrence', (date?: string) => moveOccurrenceCommand(date));
    registerOrgCommand(context, 'markdown-org.cycleTag', () => cycleTag(context));
    registerOrgCommand(context, 'markdown-org.showTagDictionary', () => showTagDictionary());
    registerOrgCommand(context, 'markdown-org.cycleAgendaHeaderMode', () => cycleAgendaHeaderMode());
    registerOrgCommand(context, 'markdown-org.cycleAgendaGrouping', () => cycleAgendaGrouping());
    // Internal: invoked by the agenda tag dropdown with the picked tag. Not in
    // package.json contributes.commands, so it stays out of the command palette
    // (it is meaningless without the tag argument).
    registerOrgCommand(context, 'markdown-org.setTag', (tag?: string) => setTag(context, tag ?? 'ALL'));
    // The help panel: the only documentation inside the editor, and the one
    // place a reader who never opens the marketplace page can be sent to.
    registerOrgCommand(context, 'markdown-org.showHelp', () => {
        DocsPanel.show(context);
    });
    registerOrgCommand(context, 'markdown-org.gcalSync.connect', () => connectGcal(context));
    registerOrgCommand(context, 'markdown-org.gcalSync.disconnect', () => disconnectGcal(context));
    registerOrgCommand(context, 'markdown-org.gcalSync.selectCalendar', () => selectCalendar(context));
    registerOrgCommand(context, 'markdown-org.gcalSync.syncNow', () => syncNow(context));

    registerBracketDiagnostics(context);
    registerMovedDiagnostics(context);
    registerOrgHighlight(context);
    registerTimestampAdjustableContext(context);
    registerGcalSaveTrigger(context);
    primeNotesRepositories(context);
}

export function deactivate() {
    /* Nothing to tear down: every disposable is registered on the context. */
}
