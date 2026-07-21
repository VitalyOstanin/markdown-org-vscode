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
        await unlink(tmp).catch(() => {});
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
}

export interface AcquireOptions {
    path: string;
    ttlMs?: number;
    heartbeatMs?: number;
    now?: () => number;
    pid?: number;
    hostname?: string;
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

async function readLock(path: string): Promise<LockData | undefined> {
    try {
        return JSON.parse(await readFile(path, 'utf8')) as LockData;
    } catch {
        return undefined;
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
        const stale = !existing || now() - existing.heartbeatAt > ttl;
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
    if (hbMs > 0) {
        timer = setInterval(() => {
            // Atomic replace (temp file + rename), never a truncating write:
            // a concurrent readLock must not observe a partially-written file
            // and mistake a live lock for a stale one.
            void atomicWrite(opts.path, JSON.stringify({ ...data, heartbeatAt: now() })).catch(() => {});
        }, hbMs);
        timer.unref?.();
    }

    return {
        async release(): Promise<void> {
            if (timer) {
                clearInterval(timer);
            }
            const cur = await readLock(opts.path);
            if (cur?.nonce === nonce) {
                try {
                    await unlink(opts.path);
                } catch {
                    /* already gone */
                }
            }
        }
    };
}
