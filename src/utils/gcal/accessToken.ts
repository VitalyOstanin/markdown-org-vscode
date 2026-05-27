import { refreshAccessToken, type FetchFn } from './oauth';
import type { TokenStore } from './tokenStore';

export type AccessTokenProvider = (opts?: { forceRefresh?: boolean }) => Promise<string>;

export interface AccessTokenDeps {
    clientId: string;
    tokens: TokenStore;
    fetchFn: FetchFn;
    now?: () => number;
    /** How long before the real expiry to treat the cached token as stale, in
     *  milliseconds. Defaults to 60_000. Negative values are clamped to 0 (a
     *  negative skew would keep using a token past its actual expiry). */
    skewMs?: number;
}

/** Cached access-token provider: refreshes via the stored refresh token.
 *  `forceRefresh` bypasses the cache -- used by calendarClient to recover from a 401. */
export function createAccessTokenProvider(deps: AccessTokenDeps): AccessTokenProvider {
    let cached: { token: string; expiresAt: number } | undefined;
    const now = deps.now ?? (() => Date.now());
    const skew = Math.max(0, deps.skewMs ?? 60_000);

    return async (opts) => {
        if (!opts?.forceRefresh && cached && cached.expiresAt - skew > now()) {
            return cached.token;
        }
        const refreshToken = await deps.tokens.getRefreshToken();
        const clientSecret = await deps.tokens.getClientSecret();
        if (!refreshToken || !clientSecret) {
            throw new Error('not connected to Google Calendar -- run "Connect Google Calendar"');
        }
        const t = await refreshAccessToken(
            deps.fetchFn,
            { clientId: deps.clientId, clientSecret, refreshToken },
            now()
        );
        // Google may rotate the refresh token; persist the new one so the next
        // refresh does not fail with invalid_grant against a stale token.
        if (t.refreshToken && t.refreshToken !== refreshToken) {
            await deps.tokens.setRefreshToken(t.refreshToken);
        }
        cached = { token: t.accessToken, expiresAt: t.expiresAt };
        return t.accessToken;
    };
}
