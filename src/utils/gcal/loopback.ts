// Loopback HTTP server that catches the OAuth redirect on 127.0.0.1:<random>/callback,
// validates the anti-CSRF state, and resolves the authorization code (with timeout).
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface LoopbackServer {
    redirectUri: string;
    /**
     * Resolve the authorization code from the next (or already-received)
     * redirect, or reject on timeout / denial / state mismatch / missing code.
     * Designed for a single call per server: a redirect captured after this
     * resolves/rejects (or after a timeout) lingers and would be consumed by a
     * second call. The connect flow calls it exactly once.
     */
    waitForCode(expectedState: string, timeoutMs: number): Promise<string>;
    /** Close the server. Does not reject an in-flight `waitForCode`; the caller
     *  disposes only after `waitForCode` has settled (resolve or reject). */
    dispose(): void;
}

const SUCCESS_HTML =
    '<!doctype html><html><body style="font-family:sans-serif">' +
    '<h3>Authentication complete</h3>' +
    '<p>You can close this tab and return to VS Code.</p></body></html>';

/** Start a loopback HTTP server on 127.0.0.1:<random>, callback path /callback. */
export async function startLoopbackServer(): Promise<LoopbackServer> {
    let pending: { code?: string; state?: string; error?: string } | undefined;
    let onPending: (() => void) | undefined;

    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/callback') {
            res.statusCode = 404;
            res.end('not found');
            return;
        }
        pending = {
            code: url.searchParams.get('code') ?? undefined,
            state: url.searchParams.get('state') ?? undefined,
            error: url.searchParams.get('error') ?? undefined
        };
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(SUCCESS_HTML);
        onPending?.();
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as AddressInfo).port;

    return {
        redirectUri: `http://127.0.0.1:${port}/callback`,
        waitForCode(expectedState: string, timeoutMs: number): Promise<string> {
            return new Promise<string>((resolve, reject) => {
                const timer = setTimeout(() => {
                    onPending = undefined;
                    reject(new Error('timed out waiting for authorization redirect'));
                }, timeoutMs);
                const settle = () => {
                    if (!pending) {
                        return;
                    }
                    clearTimeout(timer);
                    onPending = undefined;
                    if (pending.error) {
                        reject(new Error(`authorization denied: ${pending.error}`));
                    } else if (pending.state !== expectedState) {
                        reject(new Error('state mismatch (possible CSRF)'));
                    } else if (!pending.code) {
                        reject(new Error('no authorization code in redirect'));
                    } else {
                        resolve(pending.code);
                    }
                };
                onPending = settle;
                if (pending) {
                    settle(); // request may have arrived before waitForCode was called
                }
            });
        },
        dispose(): void {
            server.close();
        }
    };
}
