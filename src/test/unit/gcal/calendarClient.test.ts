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
        assert.equal(r.calls[0].method, 'DELETE');
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
            assert.equal(sleeps[0], 2000, 'honoured Retry-After: 2s');
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
            assert.equal(computeRetryDelayMs(1, undefined, 500, 8000), 500);
            assert.equal(computeRetryDelayMs(2, undefined, 500, 8000), 1000);
            assert.equal(computeRetryDelayMs(3, undefined, 500, 8000), 2000);
            assert.equal(computeRetryDelayMs(10, undefined, 500, 8000), 8000, 'capped');
            assert.equal(computeRetryDelayMs(1, 3000, 500, 8000), 3000, 'retry-after wins');
            assert.equal(computeRetryDelayMs(1, 99999, 500, 8000), 8000, 'retry-after capped');
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
        assert.equal(r.calls[0].method, 'PATCH');
        assert.ok(r.calls[0].url.endsWith('/calendars/cal/events/eid'), `unexpected PATCH url: ${r.calls[0].url}`);
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
