// Connect/disconnect orchestration for the loopback + PKCE OAuth flow; vscode-free
// seam (all I/O injected) so the end-to-end flow is unit-testable without browser/network.
import { createPkce, createState } from './pkce';
import { buildAuthUrl, exchangeCode, CALENDAR_SCOPE, type FetchFn } from './oauth';
import type { LoopbackServer } from './loopback';
import type { TokenStore } from './tokenStore';

export interface ConnectDeps {
    clientId: string;
    getClientSecret: () => Promise<string>;
    startLoopback: () => Promise<LoopbackServer>;
    openExternal: (url: string) => Promise<void>;
    fetchFn: FetchFn;
    tokens: TokenStore;
    timeoutMs: number;
}

/** Run the loopback + PKCE connect flow and persist refresh token + client secret. */
export async function runConnect(deps: ConnectDeps): Promise<void> {
    const clientSecret = await deps.getClientSecret();
    const pkce = createPkce();
    const state = createState();
    const server = await deps.startLoopback();
    try {
        const url = buildAuthUrl({
            clientId: deps.clientId,
            redirectUri: server.redirectUri,
            scope: CALENDAR_SCOPE,
            codeChallenge: pkce.challenge,
            state
        });
        await deps.openExternal(url);
        const code = await server.waitForCode(state, deps.timeoutMs);
        const token = await exchangeCode(deps.fetchFn, {
            clientId: deps.clientId,
            clientSecret,
            code,
            codeVerifier: pkce.verifier,
            redirectUri: server.redirectUri
        });
        if (!token.refreshToken) {
            throw new Error('Google returned no refresh token. Revoke this app in your Google account and reconnect.');
        }
        await deps.tokens.setClientSecret(clientSecret);
        await deps.tokens.setRefreshToken(token.refreshToken);
    } finally {
        server.dispose();
    }
}

/** Clear stored credentials. */
export async function runDisconnect(deps: { tokens: TokenStore }): Promise<void> {
    await deps.tokens.clear();
}
