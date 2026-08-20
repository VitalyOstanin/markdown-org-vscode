/**
 * Run text-editing commands one after another.
 *
 * A keybinding held down repeats: VS Code sends the command again long before
 * the previous `TextEditor.edit` has landed. The second call then reads a
 * document that is about to change, and its edit is refused — `edit` answers
 * false — so the keystroke is lost and the user is told the value was not
 * written, while holding the key is exactly how a date is walked several days
 * along.
 *
 * The queue covers the whole command rather than the edit alone: what the
 * second call must not do is read the line before the first call has rewritten
 * it, and a queue around the write would not stop that.
 *
 * One tail for the extension, not one per command: two commands editing the
 * same document at once are refused for the same reason two of one are.
 */
let tail: Promise<unknown> = Promise.resolve();

/**
 * Queue `work` behind whatever is already running, and answer with its result.
 *
 * A failing task does not stop the queue: the tail carries on from a settled
 * promise either way, and the rejection is handed to the caller alone.
 */
export function queueEdit<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
}
