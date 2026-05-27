import * as assert from 'node:assert/strict';
import { TokenStore, type SecretStore } from '../../../utils/gcal/tokenStore';

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

suite('gcal/tokenStore', () => {
    test('stores and reads refresh token and client secret', async () => {
        const ts = new TokenStore(memStore());
        await ts.setRefreshToken('rt');
        await ts.setClientSecret('cs');
        assert.equal(await ts.getRefreshToken(), 'rt');
        assert.equal(await ts.getClientSecret(), 'cs');
    });

    test('clear removes both', async () => {
        const ts = new TokenStore(memStore());
        await ts.setRefreshToken('rt');
        await ts.setClientSecret('cs');
        await ts.clear();
        assert.equal(await ts.getRefreshToken(), undefined);
        assert.equal(await ts.getClientSecret(), undefined);
    });

    test('uses the documented secret keys (cross-plan contract)', async () => {
        // The exact key strings are a contract shared with plan 2 (accessToken);
        // changing them would orphan already-stored secrets. Pin them here.
        const keys = new Map<string, string>();
        const store: SecretStore = {
            get: (k) => Promise.resolve(keys.get(k)),
            store: (k, v) => {
                keys.set(k, v);
                return Promise.resolve();
            },
            delete: (k) => {
                keys.delete(k);
                return Promise.resolve();
            }
        };
        const ts = new TokenStore(store);
        await ts.setRefreshToken('rt');
        await ts.setClientSecret('cs');
        assert.equal(keys.get('markdown-org.gcal.refreshToken'), 'rt');
        assert.equal(keys.get('markdown-org.gcal.clientSecret'), 'cs');
    });
});
