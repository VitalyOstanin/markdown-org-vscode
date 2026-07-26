import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
        await lock.release();
        assert.ok(!existsSync(p), 'lock file removed on release');
        const third = await acquireLock({ path: p, heartbeatMs: 0 });
        assert.ok(third, 'acquire after release succeeds');
        await third.release();
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
        await fresh.release();
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
        await lock.release();
    });
    // A failing heartbeat used to be swallowed: the lease silently stopped
    // being renewed, and after the TTL another window took the lock while this
    // run was still writing.
    test('a failed heartbeat is reported and counted', async () => {
        const p = await tmpLockPath();
        const errors: number[] = [];
        let t = 1_000_000;
        const lock = await acquireLock({
            path: p,
            heartbeatMs: 5,
            now: () => (t += 1000),
            onHeartbeatError: (_err, consecutive) => errors.push(consecutive)
        });
        assert.ok(lock);
        // Make the atomic write fail: the lock directory disappears, so the
        // temp file cannot be created.
        await rm(path.dirname(p), { recursive: true, force: true });
        await new Promise((r) => setTimeout(r, 40));
        assert.ok(errors.length > 0, 'expected at least one heartbeat failure to be reported');
        assert.deepEqual(
            errors,
            errors.map((_, i) => i + 1),
            'failures are counted consecutively'
        );
        assert.ok(lock.failedHeartbeats() > 0, 'the lock reports its lease as not renewed');
        await lock.release();
    });

    // The callback is part of the public contract, so the lock cannot assume it
    // behaves: a throw from it used to escape into an unhandled rejection,
    // which this extension has nowhere to report.
    test('a throwing onHeartbeatError callback does not escape the lock', async () => {
        const p = await tmpLockPath();
        let calls = 0;
        let t = 1_000_000;
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on('unhandledRejection', onUnhandled);
        try {
            const lock = await acquireLock({
                path: p,
                heartbeatMs: 5,
                now: () => (t += 1000),
                onHeartbeatError: () => {
                    calls++;
                    throw new Error('callback blew up');
                }
            });
            assert.ok(lock);
            await rm(path.dirname(p), { recursive: true, force: true });
            await new Promise((r) => setTimeout(r, 40));
            assert.ok(calls > 0, 'the callback was called');
            // Counting continues even though the callback threw.
            assert.ok(lock.failedHeartbeats() > 0);
            await lock.release();
            // Give any stray rejection a turn to surface before asserting.
            await new Promise((r) => setImmediate(r));
            assert.deepEqual(unhandled, [], 'no unhandled rejection escaped');
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });

    // A read that fails for any reason other than "no such file" says nothing
    // about whether the holder is alive, so the lock is left alone.
    test('an unreadable lock file is not treated as free', async () => {
        const p = await tmpLockPath();
        await writeFile(p, 'not json at all');
        const lock = await acquireLock({ path: p, heartbeatMs: 0 });
        assert.strictEqual(lock, null, 'a corrupt lock file must not be stolen');
    });
});
