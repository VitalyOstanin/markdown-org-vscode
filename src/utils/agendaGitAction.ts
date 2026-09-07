/**
 * Which git action a control of the agenda page stands for.
 *
 * The button ids and the commands posted back are two views of one set, and
 * both the page and the snapshot it reports for tests need the mapping. Kept
 * here rather than inside the page's own closure so it can be read without
 * rendering anything, and so the page's body carries one table fewer.
 *
 * The tables are functions rather than constants because these are inlined
 * into the page by `Function.prototype.toString()`: a constant beside them
 * would compile to a module reference the page cannot resolve, while a
 * function calling another function of this same file compiles to a bare name
 * that the page has (see inlinedHelpers.test.ts).
 */
export type GitAction = 'commit' | 'commitSync' | 'push' | 'sync';

/** The id of the button each action is pressed by. */
export function gitActionButtons(): Record<GitAction, string> {
    return {
        commit: 'gitCommitBtn',
        commitSync: 'gitCommitSyncBtn',
        push: 'gitPushBtn',
        sync: 'gitSyncBtn'
    };
}

/** The message each action posts back to the extension. */
export function gitActionCommands(): Record<GitAction, string> {
    return {
        commit: 'gitCommit',
        commitSync: 'gitCommitSync',
        push: 'gitPush',
        sync: 'gitSync'
    };
}

/**
 * Which action a button in the dropdown stands for.
 *
 * An id the table does not know reads as `commit`: the dropdown is built from
 * that same table, so an unknown id can only be a stray element, and refusing
 * to name it would leave the caller with nothing to report.
 */
export function gitActionOf(id: string): GitAction {
    const buttons = gitActionButtons();
    const found = (Object.keys(buttons) as GitAction[]).find((action) => buttons[action] === id);
    return found ?? 'commit';
}
