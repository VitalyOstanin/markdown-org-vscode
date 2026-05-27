import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { acquireLock } from '../../../utils/gcal/lock';

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
});
