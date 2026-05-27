import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { startLoopbackServer } from '../../../utils/gcal/loopback';

function hit(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            res.resume();
            res.on('end', () => resolve());
        }).on('error', reject);
    });
}

suite('gcal/loopback', () => {
    test('captures code when state matches', async () => {
        const server = await startLoopbackServer();
        try {
            const wait = server.waitForCode('st', 2000);
            await hit(`${server.redirectUri}?code=abc&state=st`);
            assert.equal(await wait, 'abc');
        } finally {
            server.dispose();
        }
    });

    test('rejects on state mismatch', async () => {
        const server = await startLoopbackServer();
        try {
            // Attach the rejection handler before triggering the (synchronous) reject,
            // otherwise Node warns about a rejection handled one tick late.
            const rejected = assert.rejects(server.waitForCode('expected', 2000), /state mismatch/);
            await hit(`${server.redirectUri}?code=abc&state=other`);
            await rejected;
        } finally {
            server.dispose();
        }
    });

    test('rejects when the redirect carries an error', async () => {
        const server = await startLoopbackServer();
        try {
            const rejected = assert.rejects(server.waitForCode('st', 2000), /authorization denied: access_denied/);
            await hit(`${server.redirectUri}?error=access_denied&state=st`);
            await rejected;
        } finally {
            server.dispose();
        }
    });

    test('rejects when state matches but no code is present', async () => {
        const server = await startLoopbackServer();
        try {
            const rejected = assert.rejects(server.waitForCode('st', 2000), /no authorization code/);
            await hit(`${server.redirectUri}?state=st`);
            await rejected;
        } finally {
            server.dispose();
        }
    });

    test('captures a redirect that arrives before waitForCode is called', async () => {
        const server = await startLoopbackServer();
        try {
            await hit(`${server.redirectUri}?code=early&state=st`);
            assert.equal(await server.waitForCode('st', 2000), 'early');
        } finally {
            server.dispose();
        }
    });

    test('rejects on timeout', async () => {
        const server = await startLoopbackServer();
        try {
            await assert.rejects(() => server.waitForCode('st', 50), /timed out/);
        } finally {
            server.dispose();
        }
    });
});
