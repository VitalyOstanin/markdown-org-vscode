import * as assert from 'node:assert/strict';
import { runConnect, runDisconnect } from '../../../utils/gcal/connect';
import { TokenStore, type SecretStore } from '../../../utils/gcal/tokenStore';
import type { FetchFn } from '../../../utils/gcal/oauth';
import type { LoopbackServer } from '../../../utils/gcal/loopback';

function memStore(): SecretStore {
    const m = new Map<string, string>();
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

function fakeLoopback(code: string, onDispose?: () => void): () => Promise<LoopbackServer> {
    return async () => ({
        redirectUri: 'http://127.0.0.1:1/callback',
        waitForCode: async () => code,
        dispose: () => {
            onDispose?.();
        }
    });
}

function fakeFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}): FetchFn {
    const ok = opts.ok ?? true;
    const status = opts.status ?? 200;
    return (async () => ({ ok, status, json: async () => body })) as unknown as FetchFn;
}

suite('gcal/connect', () => {
    test('runConnect stores client secret and refresh token', async () => {
        const tokens = new TokenStore(memStore());
        let opened = '';
        let disposed = false;
        await runConnect({
            clientId: 'cid',
            getClientSecret: async () => 'secret',
            startLoopback: fakeLoopback('the-code', () => {
                disposed = true;
            }),
            openExternal: async (url) => {
                opened = url;
            },
            fetchFn: fakeFetch({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
            tokens,
            timeoutMs: 1000
        });
        assert.match(opened, /client_id=cid/);
        assert.equal(await tokens.getRefreshToken(), 'rt');
        assert.equal(await tokens.getClientSecret(), 'secret');
        assert.ok(disposed, 'loopback server is disposed on success');
    });

    test('runConnect throws and persists nothing when no refresh token returned', async () => {
        const tokens = new TokenStore(memStore());
        let disposed = false;
        await assert.rejects(
            () =>
                runConnect({
                    clientId: 'cid',
                    getClientSecret: async () => 'secret',
                    startLoopback: fakeLoopback('c', () => {
                        disposed = true;
                    }),
                    openExternal: async () => {},
                    fetchFn: fakeFetch({ access_token: 'at', expires_in: 3600 }),
                    tokens,
                    timeoutMs: 1000
                }),
            /refresh token/
        );
        // Security invariant: secrets are persisted only on a fully successful flow.
        assert.equal(await tokens.getRefreshToken(), undefined);
        assert.equal(await tokens.getClientSecret(), undefined);
        assert.ok(disposed, 'loopback server is disposed even on failure');
    });

    test('runConnect persists nothing when the token exchange fails', async () => {
        const tokens = new TokenStore(memStore());
        let disposed = false;
        await assert.rejects(
            () =>
                runConnect({
                    clientId: 'cid',
                    getClientSecret: async () => 'secret',
                    startLoopback: fakeLoopback('c', () => {
                        disposed = true;
                    }),
                    openExternal: async () => {},
                    fetchFn: fakeFetch(
                        { error: 'invalid_grant', error_description: 'bad' },
                        { ok: false, status: 400 }
                    ),
                    tokens,
                    timeoutMs: 1000
                }),
            /token request failed/
        );
        assert.equal(await tokens.getRefreshToken(), undefined);
        assert.equal(await tokens.getClientSecret(), undefined);
        assert.ok(disposed, 'loopback server is disposed on exchange failure');
    });

    test('runDisconnect clears secrets', async () => {
        const tokens = new TokenStore(memStore());
        await tokens.setRefreshToken('rt');
        await tokens.setClientSecret('cs');
        await runDisconnect({ tokens });
        assert.equal(await tokens.getRefreshToken(), undefined);
        assert.equal(await tokens.getClientSecret(), undefined);
    });
});
