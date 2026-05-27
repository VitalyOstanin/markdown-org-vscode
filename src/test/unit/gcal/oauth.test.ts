import * as assert from 'node:assert/strict';
import {
    buildAuthUrl,
    exchangeCode,
    refreshAccessToken,
    CALENDAR_SCOPE,
    type FetchFn
} from '../../../utils/gcal/oauth';

function fakeFetch(status: number, body: unknown): FetchFn {
    return (async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    })) as unknown as FetchFn;
}

suite('gcal/oauth', () => {
    test('buildAuthUrl carries required params', () => {
        const url = buildAuthUrl({
            clientId: 'cid',
            redirectUri: 'http://127.0.0.1:1234/callback',
            scope: CALENDAR_SCOPE,
            codeChallenge: 'chal',
            state: 'st'
        });
        const u = new URL(url);
        assert.equal(u.searchParams.get('client_id'), 'cid');
        assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:1234/callback');
        assert.equal(u.searchParams.get('response_type'), 'code');
        assert.equal(u.searchParams.get('scope'), CALENDAR_SCOPE);
        assert.equal(u.searchParams.get('code_challenge'), 'chal');
        assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(u.searchParams.get('state'), 'st');
        assert.equal(u.searchParams.get('access_type'), 'offline');
        assert.equal(u.searchParams.get('prompt'), 'consent');
    });

    test('exchangeCode parses tokens and computes expiry', async () => {
        const t = await exchangeCode(
            fakeFetch(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
            { clientId: 'c', clientSecret: 's', code: 'code', codeVerifier: 'v', redirectUri: 'r' },
            1_000
        );
        assert.equal(t.accessToken, 'at');
        assert.equal(t.refreshToken, 'rt');
        assert.equal(t.expiresAt, 1_000 + 3600 * 1000);
    });

    test('refreshAccessToken maps response (refresh_token may be absent)', async () => {
        const t = await refreshAccessToken(
            fakeFetch(200, { access_token: 'at2', expires_in: 100 }),
            { clientId: 'c', clientSecret: 's', refreshToken: 'rt' },
            0
        );
        assert.equal(t.accessToken, 'at2');
        assert.equal(t.refreshToken, undefined);
        assert.equal(t.expiresAt, 100 * 1000);
    });

    test('exchangeCode defaults expires_in to 3600 when absent', async () => {
        const t = await exchangeCode(
            fakeFetch(200, { access_token: 'at' }),
            { clientId: 'c', clientSecret: 's', code: 'code', codeVerifier: 'v', redirectUri: 'r' },
            0
        );
        assert.equal(t.expiresAt, 3600 * 1000);
    });

    test('2xx without access_token throws', async () => {
        await assert.rejects(
            () =>
                exchangeCode(fakeFetch(200, { error: 'invalid_client' }), {
                    clientId: 'c',
                    clientSecret: 's',
                    code: 'code',
                    codeVerifier: 'v',
                    redirectUri: 'r'
                }),
            /no access_token/
        );
    });

    test('non-2xx throws with error description', async () => {
        await assert.rejects(
            () =>
                refreshAccessToken(fakeFetch(400, { error: 'invalid_grant', error_description: 'bad' }), {
                    clientId: 'c',
                    clientSecret: 's',
                    refreshToken: 'rt'
                }),
            /bad/
        );
    });

    test('non-2xx falls back to error code, then HTTP status', async () => {
        await assert.rejects(
            () =>
                refreshAccessToken(fakeFetch(400, { error: 'invalid_grant' }), {
                    clientId: 'c',
                    clientSecret: 's',
                    refreshToken: 'rt'
                }),
            /invalid_grant/
        );
        await assert.rejects(
            () =>
                refreshAccessToken(fakeFetch(500, {}), {
                    clientId: 'c',
                    clientSecret: 's',
                    refreshToken: 'rt'
                }),
            /HTTP 500/
        );
    });
});
