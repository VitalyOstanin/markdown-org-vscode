import * as assert from 'node:assert/strict';
import { createAccessTokenProvider } from '../../../utils/gcal/accessToken';
import { TokenStore, type SecretStore } from '../../../utils/gcal/tokenStore';
import type { FetchFn } from '../../../utils/gcal/oauth';

function memStore(seed: Record<string, string>): SecretStore {
    const m = new Map<string, string>(Object.entries(seed));
    return {
        get: (k) => Promise.resolve(m.get(k)),
        store: (k, v) => {
            m.set(k, v);
            return Promise.resolve();
        },
        delete: (k) => {
            m.delete(k);
            return Promise.resolve();
        }
    };
}

function countingFetch(accessToken: string, expiresIn: number): { fn: FetchFn; calls: () => number } {
    let calls = 0;
    const fn = (async () => {
        calls++;
        return { ok: true, status: 200, json: async () => ({ access_token: accessToken, expires_in: expiresIn }) };
    }) as unknown as FetchFn;
    return { fn, calls: () => calls };
}

const connected = {
    'markdown-org.gcal.refreshToken': 'rt',
    'markdown-org.gcal.clientSecret': 'cs'
};

suite('gcal/accessToken', () => {
    test('refreshes once and caches until near expiry', async () => {
        const tokens = new TokenStore(memStore(connected));
        const f = countingFetch('at', 3600);
        let t = 1000;
        const get = createAccessTokenProvider({
            clientId: 'cid',
            tokens,
            fetchFn: f.fn,
            now: () => t,
            skewMs: 60_000
        });
        assert.equal(await get(), 'at');
        assert.equal(await get(), 'at');
        assert.equal(f.calls(), 1, 'cached, no second refresh');
        t += 3600 * 1000; // past expiry
        assert.equal(await get(), 'at');
        assert.equal(f.calls(), 2, 'refreshed after expiry');
    });

    test('throws when not connected', async () => {
        const tokens = new TokenStore(memStore({}));
        const f = countingFetch('at', 3600);
        const get = createAccessTokenProvider({ clientId: 'cid', tokens, fetchFn: f.fn });
        await assert.rejects(() => get(), /not connected/);
    });

    test('forceRefresh bypasses the cache', async () => {
        const tokens = new TokenStore(memStore(connected));
        const f = countingFetch('at', 3600);
        const get = createAccessTokenProvider({ clientId: 'cid', tokens, fetchFn: f.fn });
        assert.equal(await get(), 'at');
        assert.equal(f.calls(), 1);
        assert.equal(await get(), 'at'); // cached
        assert.equal(f.calls(), 1);
        assert.equal(await get({ forceRefresh: true }), 'at'); // forced refresh
        assert.equal(f.calls(), 2, 'forceRefresh ignores cache');
    });

    test('refreshes exactly at the skew boundary (strict >)', async () => {
        const tokens = new TokenStore(memStore(connected));
        const f = countingFetch('at', 100); // expiresAt = now() + 100_000
        let t = 0;
        const get = createAccessTokenProvider({ clientId: 'cid', tokens, fetchFn: f.fn, now: () => t, skewMs: 10_000 });
        assert.equal(await get(), 'at');
        assert.equal(f.calls(), 1); // expiresAt = 100_000; cache valid while 90_000 > now()
        t = 90_000; // exactly the boundary: 90_000 > 90_000 is false -> refresh
        assert.equal(await get(), 'at');
        assert.equal(f.calls(), 2, 'boundary now() === expiresAt - skew refreshes');
    });

    test('throws when only the client secret is missing', async () => {
        const tokens = new TokenStore(memStore({ 'markdown-org.gcal.refreshToken': 'rt' }));
        const f = countingFetch('at', 3600);
        const get = createAccessTokenProvider({ clientId: 'cid', tokens, fetchFn: f.fn });
        await assert.rejects(() => get(), /not connected/);
        assert.equal(f.calls(), 0, 'no token request when not fully connected');
    });

    test('throws when only the refresh token is missing', async () => {
        const tokens = new TokenStore(memStore({ 'markdown-org.gcal.clientSecret': 'cs' }));
        const f = countingFetch('at', 3600);
        const get = createAccessTokenProvider({ clientId: 'cid', tokens, fetchFn: f.fn });
        await assert.rejects(() => get(), /not connected/);
        assert.equal(f.calls(), 0, 'no token request when not fully connected');
    });

    test('persists a rotated refresh token', async () => {
        const tokens = new TokenStore(memStore(connected));
        // The token endpoint returns a new refresh_token (rotation).
        const fn = (async () => ({
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'at', expires_in: 3600, refresh_token: 'rt2' })
        })) as unknown as FetchFn;
        const get = createAccessTokenProvider({ clientId: 'cid', tokens, fetchFn: fn });
        assert.equal(await get(), 'at');
        assert.equal(await tokens.getRefreshToken(), 'rt2', 'rotated refresh token is stored');
    });
});
