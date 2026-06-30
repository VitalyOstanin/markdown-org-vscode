import { busctlCall, gdbusGetAccessToken, BusctlMissingError, type DbusRun } from './dbus';
import type { AccessTokenProvider } from './accessToken';

export interface GoaAccount {
    path: string;
    email: string;
}

const ACCOUNT_IFACE = 'org.gnome.OnlineAccounts.Account';
const OAUTH_IFACE = 'org.gnome.OnlineAccounts.OAuth2Based';
const MANAGER_PATH = '/org/gnome/OnlineAccounts';
const OBJECT_MANAGER_IFACE = 'org.freedesktop.DBus.ObjectManager';

interface Variant {
    type: string;
    data: unknown;
}

function readVariantString(v: unknown): string | undefined {
    if (v && typeof v === 'object' && 'data' in v && typeof (v as Variant).data === 'string') {
        return (v as Variant).data as string;
    }
    return undefined;
}

/** All Google accounts configured in GNOME Online Accounts (via busctl). */
export async function listGoaGoogleAccounts(run: DbusRun): Promise<GoaAccount[]> {
    const data = await busctlCall(run, {
        objectPath: MANAGER_PATH,
        iface: OBJECT_MANAGER_IFACE,
        method: 'GetManagedObjects'
    });
    const managed = data[0];
    if (!managed || typeof managed !== 'object') {
        return [];
    }
    const out: GoaAccount[] = [];
    for (const [path, ifaces] of Object.entries(managed as Record<string, Record<string, Record<string, unknown>>>)) {
        const acc = ifaces?.[ACCOUNT_IFACE];
        if (!acc) {
            continue;
        }
        const provider = readVariantString(acc.ProviderType);
        const email = readVariantString(acc.PresentationIdentity);
        if (provider === 'google' && email) {
            out.push({ path, email });
        }
    }
    return out;
}

export interface GoaAccountResolution {
    account?: GoaAccount;
    needsPick: boolean;
    error?: string;
}

/** Pure selection: which GOA account to use given the configured email. */
export function resolveGoaAccount(accounts: GoaAccount[], setting: string): GoaAccountResolution {
    if (accounts.length === 0) {
        return { needsPick: false, error: 'no Google account in GNOME Online Accounts' };
    }
    const want = setting.trim();
    if (want) {
        const found = accounts.find((a) => a.email === want);
        return found
            ? { account: found, needsPick: false }
            : { needsPick: false, error: `GOA account "${want}" not found` };
    }
    if (accounts.length === 1) {
        return { account: accounts[0], needsPick: false };
    }
    return { needsPick: true };
}

export interface GoaProviderDeps {
    run: DbusRun;
    accountPath: string;
    now?: () => number;
    /** Treat the cached token as stale this many ms before its real expiry. */
    skewMs?: number;
}

async function fetchToken(run: DbusRun, accountPath: string): Promise<{ token: string; expiresIn: number }> {
    try {
        const data = await busctlCall(run, { objectPath: accountPath, iface: OAUTH_IFACE, method: 'GetAccessToken' });
        const token = data[0];
        const expiresIn = data[1];
        if (typeof token === 'string' && typeof expiresIn === 'number') {
            return { token, expiresIn };
        }
        throw new Error('GetAccessToken: unexpected output');
    } catch (e) {
        // Only fall back to gdbus when busctl itself is unavailable; a real auth
        // error must surface, not be masked by a second attempt.
        if (e instanceof BusctlMissingError) {
            const [token, expiresIn] = await gdbusGetAccessToken(run, accountPath);
            return { token, expiresIn };
        }
        throw e;
    }
}

/** AccessTokenProvider backed by GNOME Online Accounts. `forceRefresh` first
 *  asks GOA to re-validate credentials (EnsureCredentials), then fetches a fresh
 *  token. GOA performs the real OAuth refresh internally. */
export function createGoaAccessTokenProvider(deps: GoaProviderDeps): AccessTokenProvider {
    let cached: { token: string; expiresAt: number } | undefined;
    const now = deps.now ?? (() => Date.now());
    const skew = Math.max(0, deps.skewMs ?? 60_000);

    return async (opts) => {
        if (!opts?.forceRefresh && cached && cached.expiresAt - skew > now()) {
            return cached.token;
        }
        if (opts?.forceRefresh) {
            try {
                await busctlCall(deps.run, {
                    objectPath: deps.accountPath,
                    iface: ACCOUNT_IFACE,
                    method: 'EnsureCredentials'
                });
            } catch {
                // Best-effort: if EnsureCredentials is unavailable, still try to
                // fetch a token below.
            }
        }
        const { token, expiresIn } = await fetchToken(deps.run, deps.accountPath);
        cached = { token, expiresAt: now() + expiresIn * 1000 };
        return token;
    };
}
