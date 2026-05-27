// Google OAuth 2.0 helpers (loopback + PKCE): authorization URL, code exchange,
// and refresh-token grant. vscode-free; uses the global fetch via an injectable
// FetchFn so the token math and error handling are unit-testable.
export type FetchFn = typeof fetch;

export interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number; // epoch ms
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export function buildAuthUrl(opts: {
    clientId: string;
    redirectUri: string;
    scope: string;
    codeChallenge: string;
    state: string;
}): string {
    const params = new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: opts.redirectUri,
        response_type: 'code',
        scope: opts.scope,
        code_challenge: opts.codeChallenge,
        code_challenge_method: 'S256',
        state: opts.state,
        access_type: 'offline',
        prompt: 'consent'
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function toTokenResponse(json: Record<string, unknown>, now: number): TokenResponse {
    const accessToken = json.access_token;
    if (typeof accessToken !== 'string') {
        throw new Error('token endpoint returned no access_token');
    }
    const expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    return {
        accessToken,
        refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
        expiresAt: now + expiresInSec * 1000
    };
}

async function postToken(fetchFn: FetchFn, body: URLSearchParams, now: number): Promise<TokenResponse> {
    const res = await fetchFn(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        const err = (json.error_description as string) || (json.error as string) || `HTTP ${res.status}`;
        throw new Error(`token request failed: ${err}`);
    }
    return toTokenResponse(json, now);
}

export function exchangeCode(
    fetchFn: FetchFn,
    opts: { clientId: string; clientSecret: string; code: string; codeVerifier: string; redirectUri: string },
    now: number = Date.now()
): Promise<TokenResponse> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: opts.code,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code_verifier: opts.codeVerifier,
        redirect_uri: opts.redirectUri
    });
    return postToken(fetchFn, body, now);
}

export function refreshAccessToken(
    fetchFn: FetchFn,
    opts: { clientId: string; clientSecret: string; refreshToken: string },
    now: number = Date.now()
): Promise<TokenResponse> {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: opts.refreshToken,
        client_id: opts.clientId,
        client_secret: opts.clientSecret
    });
    return postToken(fetchFn, body, now);
}
