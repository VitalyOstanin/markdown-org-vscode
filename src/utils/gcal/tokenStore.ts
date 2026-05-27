/**
 * Minimal subset of `vscode.SecretStorage`, so this module stays vscode-free
 * and unit-testable. `vscode.SecretStorage` satisfies it structurally.
 */
export interface SecretStore {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
    delete(key: string): PromiseLike<void>;
}

const KEY_REFRESH = 'markdown-org.gcal.refreshToken';
const KEY_CLIENT_SECRET = 'markdown-org.gcal.clientSecret';

export class TokenStore {
    constructor(private readonly secrets: SecretStore) {}

    getRefreshToken(): PromiseLike<string | undefined> {
        return this.secrets.get(KEY_REFRESH);
    }
    setRefreshToken(value: string): PromiseLike<void> {
        return this.secrets.store(KEY_REFRESH, value);
    }
    getClientSecret(): PromiseLike<string | undefined> {
        return this.secrets.get(KEY_CLIENT_SECRET);
    }
    setClientSecret(value: string): PromiseLike<void> {
        return this.secrets.store(KEY_CLIENT_SECRET, value);
    }
    async clear(): Promise<void> {
        await this.secrets.delete(KEY_REFRESH);
        await this.secrets.delete(KEY_CLIENT_SECRET);
    }
}
