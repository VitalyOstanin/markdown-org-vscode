import * as vscode from 'vscode';
import { runFindSequence, type FindDirection } from '../utils/agendaFindCommands';

/**
 * F3 / Shift+F3 over the agenda panel: repeat the search of its find widget.
 * The sequence itself is in `agendaFindCommands`, which knows nothing of the
 * editor and is unit-tested there; this is the binding to the real command
 * runner.
 */
export async function agendaFind(direction: FindDirection): Promise<void> {
    await runFindSequence(direction, (command) => vscode.commands.executeCommand(command));
}
