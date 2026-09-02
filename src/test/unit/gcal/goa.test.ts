import * as assert from 'node:assert/strict';
import {
    listGoaGoogleAccounts,
    resolveGoaAccount,
    createGoaAccessTokenProvider,
    type GoaAccount
} from '../../../utils/gcal/goa';
import type { DbusRun } from '../../../utils/gcal/dbus';

// Shape of `busctl --json=short call ... GetManagedObjects` (verified on a real
// system): data[0] maps object path -> { iface -> { prop -> { type, data } } }.
function managedObjects(...accounts: { path: string; provider: string; email: string }[]): string {
    const data0: Record<string, unknown> = {
        '/org/gnome/OnlineAccounts/Manager': { 'org.gnome.OnlineAccounts.Manager': {} }
    };
    for (const a of accounts) {
        data0[a.path] = {
            'org.gnome.OnlineAccounts.Account': {
                ProviderType: { type: 's', data: a.provider },
                PresentationIdentity: { type: 's', data: a.email }
            }
        };
    }
    return JSON.stringify({ type: 'a{oa{sa{sv}}}', data: [data0] });
}

function fakeRun(stdout: string): DbusRun {
    return async () => ({ stdout, stderr: '', code: 0 });
}

suite('gcal/goa accounts', () => {
    test('lists only google accounts with path and email', async () => {
        const run = fakeRun(
            managedObjects(
                { path: '/a/web', provider: 'webdav', email: 'w@x' },
                { path: '/a/g1', provider: 'google', email: 'a@gmail.com' }
            )
        );
        const accts = await listGoaGoogleAccounts(run);
        assert.deepEqual(accts, [{ path: '/a/g1', email: 'a@gmail.com' }]);
    });

    test('returns empty when no google account', async () => {
        const run = fakeRun(managedObjects({ path: '/a/web', provider: 'webdav', email: 'w@x' }));
        assert.deepEqual(await listGoaGoogleAccounts(run), []);
    });

    const A: GoaAccount = { path: '/a/g1', email: 'a@gmail.com' };
    const B: GoaAccount = { path: '/a/g2', email: 'b@gmail.com' };

    test('resolveGoaAccount: empty list -> error', () => {
        const r = resolveGoaAccount([], '');
        assert.equal(r.needsPick, false);
        assert.match(r.error ?? '', /no Google account/);
    });

    test('resolveGoaAccount: single, no setting -> auto-pick', () => {
        assert.deepEqual(resolveGoaAccount([A], ''), { account: A, needsPick: false });
    });

    test('resolveGoaAccount: multiple, no setting -> needsPick', () => {
        assert.deepEqual(resolveGoaAccount([A, B], ''), { needsPick: true });
    });

    test('resolveGoaAccount: setting matches email', () => {
        assert.deepEqual(resolveGoaAccount([A, B], 'b@gmail.com'), { account: B, needsPick: false });
    });

    test('resolveGoaAccount: setting not found -> error', () => {
        const r = resolveGoaAccount([A, B], 'c@gmail.com');
        assert.equal(r.needsPick, false);
        assert.match(r.error ?? '', /not found/);
    });
});

// busctl GetAccessToken returns bare values in .data: [token, expiresIn].
function tokenRun(seq: { token: string; expiresIn: number }[]): { run: DbusRun; calls: () => string[] } {
    const methods: string[] = [];
    let i = 0;
    const run: DbusRun = async (_file, args) => {
        const method = args.at(-1)!;
        methods.push(method);
        if (method === 'EnsureCredentials') {
            return { stdout: JSON.stringify({ type: '(i)', data: [60] }), stderr: '', code: 0 };
        }
        const cur = seq[Math.min(i, seq.length - 1)];
        i++;
        return { stdout: JSON.stringify({ type: '(si)', data: [cur!.token, cur!.expiresIn] }), stderr: '', code: 0 };
    };
    return { run, calls: () => methods };
}

suite('gcal/goa token provider', () => {
    test('fetches once and caches until near expiry', async () => {
        const { run, calls } = tokenRun([{ token: 'at', expiresIn: 3600 }]);
        let t = 1000;
        const get = createGoaAccessTokenProvider({ run, accountPath: '/acc', now: () => t, skewMs: 60_000 });
        assert.equal(await get(), 'at');
        assert.equal(await get(), 'at');
        assert.equal(calls().filter((m) => m === 'GetAccessToken').length, 1, 'cached');
        t += 3600 * 1000;
        assert.equal(await get(), 'at');
        assert.equal(calls().filter((m) => m === 'GetAccessToken').length, 2, 'refetched after expiry');
    });

    test('forceRefresh calls EnsureCredentials then GetAccessToken', async () => {
        const { run, calls } = tokenRun([{ token: 'at', expiresIn: 3600 }]);
        const get = createGoaAccessTokenProvider({ run, accountPath: '/acc' });
        assert.equal(await get(), 'at');
        assert.equal(await get({ forceRefresh: true }), 'at');
        assert.deepEqual(calls(), ['GetAccessToken', 'EnsureCredentials', 'GetAccessToken']);
    });

    test('falls back to gdbus when busctl is missing', async () => {
        const run: DbusRun = async (file) => {
            if (file === 'busctl') {
                return { stdout: '', stderr: '', code: 'ENOENT' };
            }
            return { stdout: "('gtok', 1200)\n", stderr: '', code: 0 };
        };
        const get = createGoaAccessTokenProvider({ run, accountPath: '/acc' });
        assert.equal(await get(), 'gtok');
    });

    test('an account that answers without a token is reported, not cached as empty', async () => {
        // A tuple of the wrong shape reaching the cache would be handed to
        // every later request as the Authorization header, and the calendar
        // would answer 401 for the rest of the session.
        const run: DbusRun = async () => ({
            stdout: JSON.stringify({ type: '(si)', data: [null, 'later'] }),
            stderr: '',
            code: 0
        });
        const get = createGoaAccessTokenProvider({ run, accountPath: '/acc' });
        await assert.rejects(() => get(), /unexpected output/);
    });

    test('a failure that is not a missing busctl is passed on rather than retried over gdbus', async () => {
        // Falling back on a real authorization error would ask the same
        // question through a second tool and report its message instead of the
        // one that says the account is not authorized.
        const run: DbusRun = async (file) => {
            if (file === 'busctl') {
                return { stdout: '', stderr: 'Credentials not available', code: 1 };
            }
            throw new Error('gdbus must not be reached');
        };
        const get = createGoaAccessTokenProvider({ run, accountPath: '/acc' });
        await assert.rejects(() => get(), /Credentials not available/);
    });

    test('a forced refresh goes on to the token even when EnsureCredentials is unavailable', async () => {
        // Older GOA builds do not carry the method. The token request is what
        // the run actually needs, so a missing re-validation must not stop it.
        const methods: string[] = [];
        const run: DbusRun = async (_file, args) => {
            const method = args.at(-1)!;
            methods.push(method);
            if (method === 'EnsureCredentials') {
                return { stdout: '', stderr: 'Unknown method', code: 1 };
            }
            return { stdout: JSON.stringify({ type: '(si)', data: ['at', 3600] }), stderr: '', code: 0 };
        };
        const get = createGoaAccessTokenProvider({ run, accountPath: '/acc' });
        assert.equal(await get({ forceRefresh: true }), 'at');
        assert.deepEqual(methods, ['EnsureCredentials', 'GetAccessToken']);
    });
});
