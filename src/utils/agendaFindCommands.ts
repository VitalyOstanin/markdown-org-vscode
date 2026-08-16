/** Direction of a repeat-search step over the agenda panel's find widget. */
export type FindDirection = 'next' | 'previous';

/** Runs a VS Code command by id -- the seam the unit tests replace. */
export type CommandRunner = (command: string) => Thenable<unknown>;

/** The find-widget commands VS Code registers for a webview panel. */
const SHOW_FIND = 'editor.action.webvieweditor.showFind';
const FIND_NEXT = 'editor.action.webvieweditor.findNext';
const FIND_PREVIOUS = 'editor.action.webvieweditor.findPrevious';

/** The command ids a repeat-search step runs, in order. */
export function findCommandSequence(direction: FindDirection): string[] {
    // showFind first, because the step commands act on the widget and do
    // nothing when there is none: VS Code creates it lazily, so after the
    // widget is dismissed F3 would be a key that does nothing. Revealing an
    // open widget leaves its query and its current match alone, so the same
    // sequence serves both states -- reopen and step, or just step.
    return [SHOW_FIND, direction === 'next' ? FIND_NEXT : FIND_PREVIOUS];
}

/**
 * Step to the next / previous match of the agenda panel's find widget.
 *
 * VS Code binds these actions to `Enter` alone, under a condition that holds
 * only while the widget itself has the focus, so the search could not be
 * repeated from the panel. F3 / Shift+F3 reach this instead -- the keys an
 * editor uses for the same thing.
 */
export async function runFindSequence(direction: FindDirection, run: CommandRunner): Promise<void> {
    for (const command of findCommandSequence(direction)) {
        await run(command);
    }
}
