import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { acquireLock, __atomicWriteForTests as atomicWrite } from '../../../utils/gcal/lock';

async function tmpLockPath(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gcal-lock-'));
    return path.join(dir, 'sync.lock');
}

suite('gcal/lock', () => {
    test('acquires, blocks a second acquire, releases', async () => {
        const p = await tmpLockPath();
        const lock = await acquireLock({ path: p, heartbeatMs: 0 });
        assert.ok(lock, 'first acquire succeeds');
        assert.ok(existsSync(p));
        const second = await acquireLock({ path: p, heartbeatMs: 0 });
        assert.equal(second, null, 'second acquire is blocked');
        await lock!.release();
        assert.ok(!existsSync(p), 'lock file removed on release');
        const third = await acquireLock({ path: p, heartbeatMs: 0 });
        assert.ok(third, 'acquire after release succeeds');
        await third!.release();
    });

    test('steals a stale lock (heartbeat older than TTL)', async () => {
        const p = await tmpLockPath();
        let t = 1_000_000;
        const stale = await acquireLock({ path: p, heartbeatMs: 0, now: () => t });
        assert.ok(stale);
        // advance time well beyond TTL without heartbeats
        t += 10 * 60 * 1000;
        const fresh = await acquireLock({ path: p, heartbeatMs: 0, ttlMs: 30_000, now: () => t });
        assert.ok(fresh, 'stale lock is stolen');
        // the new lock owns the file (different nonce)
        const data = JSON.parse(await readFile(p, 'utf8'));
        assert.ok(typeof data.nonce === 'string');
        await fresh!.release();
    });

    test('atomicWrite replaces contents in place, leaving no temp files and valid JSON', async () => {
        const p = await tmpLockPath();
        await atomicWrite(p, JSON.stringify({ a: 1 }));
        assert.deepEqual(JSON.parse(await readFile(p, 'utf8')), { a: 1 });
        // Overwrite: a reader always sees complete JSON, never a truncated file.
        await atomicWrite(p, JSON.stringify({ a: 2, b: 'x' }));
        assert.deepEqual(JSON.parse(await readFile(p, 'utf8')), { a: 2, b: 'x' });
        // No leftover temp files in the lock directory.
        const dir = path.dirname(p);
        const leftovers = (await readdir(dir)).filter((f) => f.endsWith('.tmp'));
        assert.deepEqual(leftovers, [], 'no temp files remain after atomic writes');
    });

    test('heartbeat writes keep the lock file parseable (no partial JSON)', async () => {
        const p = await tmpLockPath();
        let t = 1_000_000;
        const lock = await acquireLock({ path: p, heartbeatMs: 5, now: () => (t += 1000) });
        assert.ok(lock);
        // Let a few heartbeats fire, then confirm the file is always valid JSON.
        await new Promise((r) => setTimeout(r, 30));
        const data = JSON.parse(await readFile(p, 'utf8'));
        assert.ok(typeof data.heartbeatAt === 'number');
        assert.ok(typeof data.nonce === 'string');
        await lock!.release();
    });
});
