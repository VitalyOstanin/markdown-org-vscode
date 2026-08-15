/**
 * The date locale the panel renders with, read on the host side.
 *
 * Notifications raised by a panel action carry the same counts the panel does,
 * so they have to be written in the same digits. The panel resolves the setting
 * for its own render (agendaPanel.resolveLocaleSetting, which also warns about a
 * rejected value); this is the read for the commands, which need the value and
 * not the warning -- a second warning per commit would say nothing new.
 */
import * as vscode from 'vscode';
import { resolveDateLocale } from './dateLocale';

export function currentDateLocale(): string {
    const configured = vscode.workspace.getConfiguration('markdown-org').get<string>('dateLocale');
    return resolveDateLocale(configured).locale;
}
