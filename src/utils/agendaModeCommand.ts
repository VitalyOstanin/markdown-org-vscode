/**
 * The command that opens each agenda mode.
 *
 * Two paths need this mapping -- the webview's mode switch and the history
 * replay -- and they used to spell it out separately, with different fallbacks
 * for an unknown mode. Keeping it in one place is what makes those two agree.
 *
 * A Map rather than an object literal: lookups then answer only for the four
 * real modes, instead of also resolving inherited names like `toString`.
 */
const MODE_COMMANDS = new Map<string, string>([
    ['day', 'markdown-org.showAgendaDay'],
    ['week', 'markdown-org.showAgendaWeek'],
    ['month', 'markdown-org.showAgendaMonth'],
    ['tasks', 'markdown-org.showTasks']
]);

/** Command id for `mode`, or `undefined` when the mode is not one of the four. */
export function agendaModeCommand(mode: string | undefined | null): string | undefined {
    return mode ? MODE_COMMANDS.get(mode) : undefined;
}
