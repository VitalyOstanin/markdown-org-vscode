import type { HighlightKind } from './orgHighlightSpans';

/**
 * Colour for every highlight kind, as a theme colour token rather than a hex
 * value. These are the same tokens the agenda panel paints with
 * (`agendaStyles.ts`: `--vscode-charts-red` for a DEADLINE and priority A,
 * `--vscode-charts-yellow` for a repeater and priority B, `--vscode-charts-blue`
 * for a SCHEDULED, a time and priority C, `--vscode-charts-green` for DONE,
 * `--vscode-disabledForeground` for a cancelled task), so a task line reads the
 * same in the editor and in the agenda instead of picking up whatever colour a
 * theme happens to give a TextMate scope. The agenda blends its accents a third
 * of the way towards the editor foreground for large surfaces; single words in
 * the editor take the unblended token, which is the more legible of the two on
 * a short run of text.
 */
export const KIND_COLORS: Record<HighlightKind, string> = {
    'planning-deadline': 'charts.red',
    'planning-scheduled': 'charts.blue',
    'planning-closed': 'charts.green',
    'planning-created': 'disabledForeground',
    'planning-clock': 'charts.blue',
    date: 'charts.blue',
    weekday: 'charts.blue',
    time: 'charts.blue',
    repeater: 'charts.yellow',
    warning: 'charts.yellow',
    'status-todo': 'charts.blue',
    'status-done': 'charts.green',
    'status-cancelled': 'disabledForeground',
    'priority-a': 'charts.red',
    'priority-b': 'charts.yellow',
    'priority-c': 'charts.blue'
};

/**
 * Kinds that carry weight as well as colour.
 *
 * Colour alone is not enough inside a timestamp. Markdown reads the planning
 * line as inline code, and a theme is free to paint that run any colour it
 * likes: on Monokai it is `#FD971F`, against which `charts.yellow` resolves to
 * `#CCA700` -- a contrast ratio of 1.06, so a repeater is coloured and reads
 * as no different from the text around it, while the date beside it stands out
 * at 1.41 in blue. Yellow is the agenda's colour for a repeater and stays; the
 * weight is what carries the difference whatever the theme does with the line.
 */
export const KIND_WEIGHTS: Partial<Record<HighlightKind, string>> = {
    repeater: 'bold',
    warning: 'bold'
};

/** The parts a timestamp is made of, where the theme paints under the decoration. */
export const TIMESTAMP_KINDS: readonly HighlightKind[] = ['date', 'weekday', 'time', 'repeater', 'warning'];
