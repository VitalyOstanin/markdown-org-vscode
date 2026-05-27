import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPkce, createState } from '../../../utils/gcal/pkce';

suite('gcal/pkce', () => {
    test('createPkce derives S256 challenge from verifier (deterministic with fixed rand)', () => {
        const rand = (_n: number) => Buffer.alloc(32, 7); // fixed bytes
        const pkce = createPkce(rand);
        const expectedVerifier = Buffer.alloc(32, 7)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        assert.equal(pkce.verifier, expectedVerifier);
        assert.equal(pkce.method, 'S256');
        const expectedChallenge = createHash('sha256')
            .update(pkce.verifier)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        assert.equal(pkce.challenge, expectedChallenge);
        assert.match(pkce.verifier, /^[A-Za-z0-9_-]+$/);
        assert.match(pkce.challenge, /^[A-Za-z0-9_-]+$/);
    });

    test('createState is non-empty and url-safe', () => {
        const s = createState(() => Buffer.alloc(16, 1));
        assert.ok(s.length > 0);
        assert.match(s, /^[A-Za-z0-9_-]+$/);
    });
});
