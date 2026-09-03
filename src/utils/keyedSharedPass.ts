/**
 * One pass per key at a time, shared by everyone who asks meanwhile.
 *
 * Written for the agenda's git status, where a pass costs a `git status` over
 * the whole tree: several agenda source files land in the same repository and
 * the collector asks for each of them, so without this one render would run
 * the pass as many times as it has files there.
 *
 * Unlike {@link KeyedResolutionCache} nothing is remembered once the pass ends
 * -- this is a "not twice at once" rule, not an answer. The entry is dropped as
 * the pass finishes so the next caller starts a fresh one, which is what a
 * repository that changed in between needs.
 */
export class KeyedSharedPass {
    private readonly running = new Map<string, Promise<boolean>>();

    /** The pass in flight for `key`, or `start()`'s, shared while it runs. */
    run(key: string, start: () => Promise<boolean>): Promise<boolean> {
        const running = this.running.get(key);
        if (running) {
            return running;
        }
        const pass = start().finally(() => {
            // Only if the entry is still this one: `clear()` plus a fresh pass
            // can both happen while this one is in flight, and deleting by key
            // alone would drop that newer entry -- a second `git status` over
            // a tree already being read.
            if (this.running.get(key) === pass) {
                this.running.delete(key);
            }
        });
        this.running.set(key, pass);
        return pass;
    }

    /** Forget every pass in flight. */
    clear(): void {
        this.running.clear();
    }
}
