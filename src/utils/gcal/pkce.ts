// PKCE (RFC 7636) S256 verifier/challenge and anti-CSRF state helpers.
import { createHash, randomBytes } from 'node:crypto';

export interface Pkce {
    verifier: string;
    challenge: string;
    method: 'S256';
}

function base64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE verifier/challenge pair (S256). `rand` is injectable for tests. */
export function createPkce(rand: (n: number) => Buffer = randomBytes): Pkce {
    const verifier = base64url(rand(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    return { verifier, challenge, method: 'S256' };
}

/** Opaque anti-CSRF state value. */
export function createState(rand: (n: number) => Buffer = randomBytes): string {
    return base64url(rand(16));
}
