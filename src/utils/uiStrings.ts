import * as vscode from 'vscode';
import type { AgendaStrings, UiLanguage } from './agendaI18n';
import { AGENDA_STRINGS, resolveUiLanguage } from './agendaI18n';
import { explicitSettingValue } from './explicitSetting';

/**
 * The UI language and its dictionary, read from settings on every call so a
 * `markdown-org.uiLanguage` (or `dateLocale`) change reaches the next agenda
 * render and the next prompt without reopening anything.
 *
 * `inspect`, not `get`: the date locale only gets a vote when the user
 * actually chose one. `get` would fold in the `en-US` default and make the
 * first step of `resolveUiLanguage` always match, leaving the editor-language
 * step unreachable -- a Russian VS Code with untouched settings then showed an
 * English agenda, contradicting what `uiLanguage: auto` promises.
 */
export function currentUiStrings(): { language: UiLanguage; strings: AgendaStrings } {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const explicitLocale = explicitSettingValue(config.inspect<string>('dateLocale')) ?? '';
    const language = resolveUiLanguage(config.get<string>('uiLanguage', 'auto'), explicitLocale, vscode.env.language);
    return { language, strings: AGENDA_STRINGS[language] };
}
