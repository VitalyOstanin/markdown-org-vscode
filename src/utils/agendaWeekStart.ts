import * as vscode from 'vscode';
import { resolveWeekStart } from './agendaCalendarHtml';
import type { ResolvedWeekStart } from './agendaCalendarHtml';
import { resolveDateLocale } from './dateLocale';

/**
 * The weekday the month grid begins on, from the settings as they stand.
 *
 * `markdown-org.firstDayOfWeek` also accepts `auto`, which the extractor does
 * not: it reads no locale of its own, so the choice is made here from
 * `markdown-org.dateLocale` -- the same locale the panel renders with, and so
 * the same answer the column headers are drawn from.
 */
export function configuredWeekStart(): ResolvedWeekStart {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const { locale } = resolveDateLocale(config.get<string>('dateLocale'));
    return resolveWeekStart(config.get<string>('firstDayOfWeek', 'monday'), locale);
}
