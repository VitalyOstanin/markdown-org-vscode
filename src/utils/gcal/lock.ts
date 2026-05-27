import { open, readFile, writeFile, unlink } from 'node:fs/promises';
import { hostname as osHostname } from 'node:os';
import { randomUUID } from 'node:crypto';

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
            void writeFile(opts.path, JSON.stringify({ ...data, heartbeatAt: now() })).catch(() => {});
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
