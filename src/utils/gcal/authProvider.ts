export type AuthProviderSetting = 'auto' | 'goa' | 'oauth';
export type ResolvedAuthProvider = 'goa' | 'oauth';

export interface ChooseAuthProviderOpts {
    setting: AuthProviderSetting;
    platform: NodeJS.Platform;
    hasGoaGoogleAccount: boolean;
}

/** Pure decision: which token provider to use. Returns an `error` only for an
 *  impossible forced choice (goa on non-Linux); the caller throws it. */
export function chooseAuthProvider(opts: ChooseAuthProviderOpts): { provider: ResolvedAuthProvider; error?: string } {
    if (opts.setting === 'oauth') {
        return { provider: 'oauth' };
    }
    if (opts.setting === 'goa') {
        if (opts.platform !== 'linux') {
            return { provider: 'goa', error: 'GOA token provider is available only on Linux' };
        }
        return { provider: 'goa' };
    }
    // auto
    if (opts.platform === 'linux' && opts.hasGoaGoogleAccount) {
        return { provider: 'goa' };
    }
    return { provider: 'oauth' };
}
