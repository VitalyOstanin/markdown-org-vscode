import * as assert from 'node:assert/strict';
import {
    listWritableCalendars,
    ensureCalendar,
    insertEvent,
    patchEvent,
    deleteEvent,
    isTransientStatus,
    parseRetryAfterMs,
    computeRetryDelayMs,
    setRetrySleepForTests
} from '../../../utils/gcal/calendarClient';
import type { FetchFn } from '../../../utils/gcal/oauth';

interface Call {
    url: string;
    method: string;
    body?: unknown;
}

function recorder(responder: (call: Call) => { status: number; body: unknown; retryAfter?: string }): {
    fn: FetchFn;
    calls: Call[];
} {
    const calls: Call[] = [];
    const fn = (async (url: string, init?: { method?: string; body?: string }) => {
        const call: Call = {
            url,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(init.body) : undefined
        };
        calls.push(call);
        const r = responder(call);
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body,
            headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? (r.retryAfter ?? null) : null) }
        };
    }) as unknown as FetchFn;
    return { fn, calls };
}

const token = async () => 'AT';

suite('gcal/calendarClient', () => {
    test('listWritableCalendars filters by accessRole', async () => {
        const r = recorder(() => ({
            status: 200,
            body: {
                items: [
                    { id: 'a', summary: 'A', accessRole: 'owner' },
                    { id: 'b', summary: 'B', accessRole: 'reader' },
                    { id: 'c', summary: 'C', accessRole: 'writer' }
                ]
            }
        }));
        const cals = await listWritableCalendars(r.fn, token);
        assert.deepEqual(
            cals.map((c) => c.id),
            ['a', 'c']
        );
    });

    test('ensureCalendar returns pinned id when it exists', async () => {
        const r = recorder((call) =>
            call.method === 'GET' && call.url.includes('/calendars/pin')
                ? { status: 200, body: { id: 'pin', summary: 'Pinned', accessRole: 'owner' } }
                : { status: 200, body: {} }
        );
        const id = await ensureCalendar(r.fn, token, { name: 'markdown-org', pinnedId: 'pin' });
        assert.equal(id, 'pin');
    });

    test('ensureCalendar finds by name', async () => {
        const r = recorder(() => ({
            status: 200,
            body: { items: [{ id: 'x', summary: 'markdown-org', accessRole: 'owner' }] }
        }));
        const id = await ensureCalendar(r.fn, token, { name: 'markdown-org' });
        assert.equal(id, 'x');
    });

    test('ensureCalendar creates when missing', async () => {
        const r = recorder((call) => {
            if (call.method === 'GET') return { status: 200, body: { items: [] } };
            return { status: 200, body: { id: 'new', summary: 'markdown-org', accessRole: 'owner' } }; // POST /calendars
        });
        const id = await ensureCalendar(r.fn, token, { name: 'markdown-org' });
        assert.equal(id, 'new');
        const post = r.calls.find((c) => c.method === 'POST');
        assert.deepEqual(post?.body, { summary: 'markdown-org' });
    });

    test('insertEvent reports conflict on 409', async () => {
        const r = recorder(() => ({ status: 409, body: { error: { message: 'duplicate' } } }));
        const res = await insertEvent(r.fn, token, 'cal', {
            id: 'eid',
            summary: 'S',
            start: { date: '2026-06-01' },
            end: { date: '2026-06-02' }
        });
        assert.equal(res.status, 'conflict');
    });

    test('deleteEvent ignores 404/410', async () => {
        const r = recorder(() => ({ status: 404, body: {} }));
        await deleteEvent(r.fn, token, 'cal', 'eid'); // must not throw
        assert.equal(r.calls[0]!.method, 'DELETE');
    });

    test('call retries once on 401 with a forced token refresh', async () => {
        let n = 0;
        const r = recorder(() =>
            ++n === 1 ? { status: 401, body: { error: { message: 'expired' } } } : { status: 200, body: { items: [] } }
        );
        const forced: boolean[] = [];
        const tok = async (opts?: { forceRefresh?: boolean }) => {
            forced.push(!!opts?.forceRefresh);
            return 'AT';
        };
        await listWritableCalendars(r.fn, tok);
        assert.equal(r.calls.length, 2, 'one retry after 401');
        assert.deepEqual(forced, [false, true], 'second attempt forced a refresh');
    });

    // The 401 branch is allowed once; a later transient retry must not keep
    // re-forcing the refresh. With one flag doing both jobs it did, adding up
    // to three needless token-endpoint round trips per API call.
    test('a transient retry after a 401 does not force another token refresh', async () => {
        let n = 0;
        const r = recorder(() => {
            n++;
            if (n === 1) return { status: 401, body: { error: { message: 'expired' } } };
            if (n === 2) return { status: 503, body: {} };
            return { status: 200, body: { items: [] } };
        });
        const forced: boolean[] = [];
        const tok = async (opts?: { forceRefresh?: boolean }) => {
            forced.push(!!opts?.forceRefresh);
            return 'AT';
        };
        setRetrySleepForTests(async () => {});
        try {
            await listWritableCalendars(r.fn, tok);
        } finally {
            setRetrySleepForTests();
        }
        assert.deepEqual(forced, [false, true, false], 'only the 401 retry forces a refresh');
    });

    suite('transient-error retry (429/5xx)', () => {
        const sleeps: number[] = [];
        setup(() => {
            sleeps.length = 0;
            setRetrySleepForTests((ms) => {
                sleeps.push(ms);
                return Promise.resolve();
            });
        });
        teardown(() => setRetrySleepForTests());

        test('retries on 500 then succeeds', async () => {
            let n = 0;
            const r = recorder(() =>
                ++n === 1 ? { status: 500, body: { error: { message: 'boom' } } } : { status: 200, body: { items: [] } }
            );
            const cals = await listWritableCalendars(r.fn, token);
            assert.deepEqual(cals, []);
            assert.equal(r.calls.length, 2, 'one retry after 500');
            assert.equal(sleeps.length, 1, 'one backoff sleep');
        });

        test('retries on 429 respecting Retry-After header', async () => {
            let n = 0;
            const r = recorder(() =>
                ++n === 1
                    ? { status: 429, body: { error: { message: 'rate' } }, retryAfter: '2' }
                    : { status: 200, body: { items: [] } }
            );
            await listWritableCalendars(r.fn, token);
            assert.equal(r.calls.length, 2);
            // Not less than what the server asked for, and no more than the
            // jitter (up to one base interval) can add on top.
            assert.ok(sleeps[0]! >= 2000 && sleeps[0]! <= 2500, `honoured Retry-After: 2s (+jitter), got ${sleeps[0]}`);
        });

        test('gives up after MAX_RETRIES and surfaces the error', async () => {
            const r = recorder(() => ({ status: 503, body: { error: { message: 'down' } } }));
            await assert.rejects(() => listWritableCalendars(r.fn, token), /list calendars/);
            // 1 initial + 3 retries = 4 fetch calls
            assert.equal(r.calls.length, 4);
            assert.equal(sleeps.length, 3);
        });

        test('does not retry non-transient 4xx', async () => {
            const r = recorder(() => ({ status: 403, body: { error: { message: 'forbidden' } } }));
            await assert.rejects(() => listWritableCalendars(r.fn, token), /list calendars/);
            assert.equal(r.calls.length, 1, 'no retry on 403');
        });

        test('retries a network failure, which never produces a status at all', async () => {
            // The most common transient failure has no response: a dropped
            // connection, a DNS hiccup, a TLS error. Before, it escaped the
            // retry loop entirely while the rarer 5xx was retried.
            let n = 0;
            const inner = recorder(() => ({ status: 200, body: { items: [] } }));
            const fn = (async (url: string, init?: unknown) => {
                if (++n === 1) {
                    throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
                }
                return (inner.fn as unknown as (u: string, i?: unknown) => Promise<unknown>)(url, init);
            }) as unknown as FetchFn;

            const cals = await listWritableCalendars(fn, token);
            assert.deepEqual(cals, []);
            assert.equal(n, 2, 'one retry after the network error');
            assert.equal(sleeps.length, 1, 'the retry went through the backoff');
        });

        test('gives up on a network failure after MAX_RETRIES and rethrows it', async () => {
            let n = 0;
            const fn = (async () => {
                n++;
                throw new Error('getaddrinfo ENOTFOUND www.googleapis.com');
            }) as unknown as FetchFn;

            await assert.rejects(() => listWritableCalendars(fn, token), /ENOTFOUND/);
            assert.equal(n, 4, '1 initial + 3 retries');
        });

        test('an abort signal stops the retry chain instead of sleeping it out', async () => {
            // The heartbeat watchdog sets `aborted` when the lock lease is
            // gone: another window is about to take over, so this run must stop
            // touching the calendar rather than finish its backoff first.
            const signal = { aborted: false };
            const r = recorder(() => ({ status: 503, body: { error: { message: 'down' } } }));
            setRetrySleepForTests(() => {
                signal.aborted = true;
                return Promise.resolve();
            });

            await assert.rejects(() => listWritableCalendars(r.fn, token, { signal }), /aborted/i);
            assert.equal(r.calls.length, 1, 'no request goes out after the abort');
        });

        test('a token failure is retried the same way', async () => {
            let n = 0;
            const r = recorder(() => ({ status: 200, body: { items: [] } }));
            const flakyToken = async () => {
                if (++n === 1) {
                    throw new Error('token endpoint unreachable');
                }
                return 'AT';
            };
            await listWritableCalendars(r.fn, flakyToken);
            assert.equal(n, 2, 'the token provider was tried again');
        });
    });

    suite('retry helpers', () => {
        test('isTransientStatus classifies 429 and 5xx only', () => {
            assert.equal(isTransientStatus(429), true);
            assert.equal(isTransientStatus(500), true);
            assert.equal(isTransientStatus(503), true);
            assert.equal(isTransientStatus(400), false);
            assert.equal(isTransientStatus(401), false);
            assert.equal(isTransientStatus(200), false);
        });

        test('parseRetryAfterMs handles seconds and HTTP-date', () => {
            assert.equal(parseRetryAfterMs('12', 0), 12000);
            assert.equal(parseRetryAfterMs(null, 0), undefined);
            assert.equal(parseRetryAfterMs('', 0), undefined);
            assert.equal(parseRetryAfterMs('garbage', 0), undefined);
            const now = Date.parse('2026-01-01T00:00:00Z');
            assert.equal(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:05 GMT', now), 5000);
        });

        test('computeRetryDelayMs uses exponential backoff and caps', () => {
            // The exponential value is the upper bound of the jittered window,
            // so it is asserted with random() pinned to 1.
            const full = () => 1;
            assert.equal(computeRetryDelayMs(1, undefined, 500, 8000, full), 500);
            assert.equal(computeRetryDelayMs(2, undefined, 500, 8000, full), 1000);
            assert.equal(computeRetryDelayMs(3, undefined, 500, 8000, full), 2000);
            assert.equal(computeRetryDelayMs(10, undefined, 500, 8000, full), 8000, 'capped');
            const none = () => 0;
            assert.equal(computeRetryDelayMs(1, 3000, 500, 8000, none), 3000, 'retry-after wins');
            assert.equal(computeRetryDelayMs(1, 99999, 500, 8000, none), 8000, 'retry-after capped');
        });

        test('computeRetryDelayMs spreads the delay when a random source is supplied', () => {
            // Several VS Code windows hitting the same 429 would otherwise wake
            // up at the same millisecond and retry in lockstep. The jitter keeps
            // the delay between half the exponential value and the full one.
            assert.equal(
                computeRetryDelayMs(2, undefined, 500, 8000, () => 0),
                500,
                'half at random()=0'
            );
            assert.equal(
                computeRetryDelayMs(2, undefined, 500, 8000, () => 1),
                1000,
                'full at random()=1'
            );
            assert.equal(
                computeRetryDelayMs(2, undefined, 500, 8000, () => 0.5),
                750
            );
        });

        test('a Retry-After delay is only ever extended by jitter, never shortened', () => {
            // The server named the earliest acceptable time; waiting less would
            // ignore it. The spread goes on top, and the cap still holds.
            assert.equal(
                computeRetryDelayMs(1, 3000, 500, 8000, () => 0),
                3000
            );
            assert.equal(
                computeRetryDelayMs(1, 3000, 500, 8000, () => 1),
                3500
            );
            assert.equal(
                computeRetryDelayMs(1, 8000, 500, 8000, () => 1),
                8000,
                'still capped'
            );
        });
    });

    // patchEvent tests added beyond the task text to satisfy the coverage rule:
    // patchEvent is an exported function, so its observable behaviour must be tested.
    test('patchEvent sends PATCH to the event path and does not throw on 2xx', async () => {
        const r = recorder(() => ({ status: 200, body: { id: 'eid', summary: 'S2' } }));
        await patchEvent(r.fn, token, 'cal', 'eid', {
            summary: 'S2',
            start: { date: '2026-06-01' },
            end: { date: '2026-06-02' }
        });
        assert.equal(r.calls.length, 1);
        assert.equal(r.calls[0]!.method, 'PATCH');
        assert.ok(r.calls[0]!.url.endsWith('/calendars/cal/events/eid'), `unexpected PATCH url: ${r.calls[0]!.url}`);
    });

    test('patchEvent throws with an "update event" message on a server error', async () => {
        const r = recorder(() => ({ status: 500, body: { error: { message: 'boom' } } }));
        await assert.rejects(
            () =>
                patchEvent(r.fn, token, 'cal', 'eid', {
                    summary: 'S2',
                    start: { date: '2026-06-01' },
                    end: { date: '2026-06-02' }
                }),
            /update event/
        );
    });
});
