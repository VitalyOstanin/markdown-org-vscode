/**
 * One answer per key, shared by everyone who asks for it.
 *
 * Written for the agenda's git status, where the answer costs a `git` process:
 * `getRepositoryRoot` runs `git rev-parse --show-toplevel`, and the pass asks
 * once per source file. Files of one notes directory all get the same answer,
 * so the key is the directory and the process runs once for the lot of them.
 *
 * The promise is stored, not the value: two files of the same directory can be
 * resolved concurrently, and caching only finished answers would let both start
 * their own process. A rejected computation is dropped instead of remembered --
 * a transient failure must not become the answer for the rest of the session.
 *
 * The entries have no lifetime of their own; the owner clears them when
 * something happened that could change the answers (a repository opened or
 * closed, for the git case).
 */
export class KeyedResolutionCache<T> {
    private readonly entries = new Map<string, Promise<T>>();

    /** The stored answer for `key`, or what `compute` returns, stored. */
    resolve(key: string, compute: () => Promise<T>): Promise<T> {
        const cached = this.entries.get(key);
        if (cached) {
            return cached;
        }
        const pending = compute();
        this.entries.set(key, pending);
        return pending.catch((error: unknown) => {
            this.entries.delete(key);
            throw error;
        });
    }

    /** Forget every answer. */
    clear(): void {
        this.entries.clear();
    }
}
