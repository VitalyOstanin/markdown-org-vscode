import { open, readFile, rename, unlink } from 'node:fs/promises';
import { hostname as osHostname } from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * Atomically replace the lock file's contents. Writes a uniquely-named temp
 * file in the same directory, then rename()s it over the target — rename is
 * atomic on POSIX and NTFS for same-filesystem paths, so a concurrent reader
 * never observes a half-written file. A plain truncating writeFile is NOT
 * atomic: a concurrent readLock could read a partial JSON, fail to parse, and
 * treat a live lock as stale (stealing it).
 */
async function atomicWrite(path: string, contents: string): Promise<void> {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const fh = await open(tmp, 'wx');
    try {
        await fh.writeFile(contents);
    } finally {
        await fh.close();
    }
    try {
        await rename(tmp, path);
    } catch (e) {
        await unlink(tmp).catch(() => {
            /* best effort */
        });
        throw e;
    }
}

/** Exported for unit testing the atomic replace in isolation. */
export const __atomicWriteForTests = atomicWrite;

interface LockData {
    pid: number;
    hostname: string;
    nonce: string;
    startedAt: number;
    heartbeatAt: number;
}

export interface Lock {
    release(): Promise<void>;
    /**
     * How many heartbeat writes have failed in a row. Non-zero means the lease
     * is no longer being renewed: after `ttlMs` another process considers the
     * lock stale and takes it, while this run is still writing. A long-running
     * caller should check this and stop.
     */
    failedHeartbeats(): number;
}

export interface AcquireOptions {
    path: string;
    ttlMs?: number;
    heartbeatMs?: number;
    now?: () => number;
    pid?: number;
    hostname?: string;
    /**
     * Called on every failed heartbeat write with the reason and the number of
     * consecutive failures, so the caller can report it and decide when to
     * abandon the run. Silence used to be the only behaviour: the lease simply
     * stopped being renewed.
     */
    onHeartbeatError?: (error: unknown, consecutiveFailures: number) => void;
}

async function tryCreate(path: string, data: LockData): Promise<boolean> {
    try {
        const fh = await open(path, 'wx');
        await fh.writeFile(JSON.stringify(data));
        await fh.close();
        return true;
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
            return false;
        }
        throw e;
    }
}

/**
 * Read the lock file.
 *
 * The three outcomes are kept apart on purpose. "missing" is a free lock;
 * "unreadable" is an I/O failure or a corrupt file, and treating that as a free
 * lock is how a transient read error turns into two syncs writing the same
 * files at once. Only "held" carries data.
 */
type LockRead = { kind: 'held'; data: LockData } | { kind: 'missing' } | { kind: 'unreadable' };

async function readLock(path: string): Promise<LockRead> {
    let raw: string;
    try {
        raw = await readFile(path, 'utf8');
    } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'missing' } : { kind: 'unreadable' };
    }
    try {
        return { kind: 'held', data: JSON.parse(raw) as LockData };
    } catch {
        // Present but not parseable: someone's partially-written or corrupt
        // file. Not ours to steal on this pass.
        return { kind: 'unreadable' };
    }
}

/** Acquire a cross-process workspace lock, or return null if held & fresh. */
export async function acquireLock(opts: AcquireOptions): Promise<Lock | null> {
    const now = opts.now ?? (() => Date.now());
    const ttl = opts.ttlMs ?? 30_000;
    const hbMs = opts.heartbeatMs ?? 5_000;
    const nonce = randomUUID();
    const data: LockData = {
        pid: opts.pid ?? process.pid,
        hostname: opts.hostname ?? osHostname(),
        nonce,
        startedAt: now(),
        heartbeatAt: now()
    };

    let created = await tryCreate(opts.path, data);
    if (!created) {
        const existing = await readLock(opts.path);
        if (existing.kind === 'unreadable') {
            // Cannot tell whether it is alive; assume it is.
            return null;
        }
        const stale = existing.kind === 'missing' || now() - existing.data.heartbeatAt > ttl;
        if (!stale) {
            return null;
        }
        try {
            await unlink(opts.path);
        } catch {
            /* another process may have removed it first */
        }
        created = await tryCreate(opts.path, data);
        if (!created) {
            return null; // lost the steal race
        }
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    let consecutiveFailures = 0;
    if (hbMs > 0) {
        timer = setInterval(() => {
            // Atomic replace (temp file + rename), never a truncating write:
            // a concurrent readLock must not observe a partially-written file
            // and mistake a live lock for a stale one.
            void atomicWrite(opts.path, JSON.stringify({ ...data, heartbeatAt: now() })).then(
                () => {
                    consecutiveFailures = 0;
                },
                (err: unknown) => {
                    consecutiveFailures++;
                    try {
                        opts.onHeartbeatError?.(err, consecutiveFailures);
                    } catch {
                        // The callback belongs to the caller and this chain is
                        // fire-and-forget, so a throw from it would become an
                        // unhandled rejection -- which this extension registers
                        // no handler for, meaning it would surface nowhere at
                        // all. The failure is still counted above, which is
                        // what `failedHeartbeats()` reports.
                    }
                }
            );
        }, hbMs);
        timer.unref?.();
    }

    return {
        failedHeartbeats(): number {
            return consecutiveFailures;
        },
        async release(): Promise<void> {
            if (timer) {
                clearInterval(timer);
            }
            const cur = await readLock(opts.path);
            if (cur.kind === 'held' && cur.data.nonce === nonce) {
                try {
                    await unlink(opts.path);
                } catch {
                    /* already gone */
                }
            }
        }
    };
}
