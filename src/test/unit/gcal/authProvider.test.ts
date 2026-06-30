import * as assert from 'node:assert/strict';
import { chooseAuthProvider } from '../../../utils/gcal/authProvider';

suite('gcal/authProvider', () => {
    test('oauth setting always resolves to oauth', () => {
        assert.deepEqual(chooseAuthProvider({ setting: 'oauth', platform: 'linux', hasGoaGoogleAccount: true }), {
            provider: 'oauth'
        });
    });

    test('goa setting on non-linux yields error', () => {
        const r = chooseAuthProvider({ setting: 'goa', platform: 'win32', hasGoaGoogleAccount: false });
        assert.equal(r.provider, 'goa');
        assert.match(r.error ?? '', /only on Linux/);
    });

    test('goa setting on linux resolves to goa', () => {
        assert.deepEqual(chooseAuthProvider({ setting: 'goa', platform: 'linux', hasGoaGoogleAccount: false }), {
            provider: 'goa'
        });
    });

    test('auto on linux with goa account -> goa', () => {
        assert.deepEqual(chooseAuthProvider({ setting: 'auto', platform: 'linux', hasGoaGoogleAccount: true }), {
            provider: 'goa'
        });
    });

    test('auto on linux without goa account -> oauth', () => {
        assert.deepEqual(chooseAuthProvider({ setting: 'auto', platform: 'linux', hasGoaGoogleAccount: false }), {
            provider: 'oauth'
        });
    });

    test('auto on macos -> oauth', () => {
        assert.deepEqual(chooseAuthProvider({ setting: 'auto', platform: 'darwin', hasGoaGoogleAccount: false }), {
            provider: 'oauth'
        });
    });
});
