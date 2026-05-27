import * as assert from 'node:assert/strict';
import {
    listWritableCalendars,
    ensureCalendar,
    insertEvent,
    patchEvent,
    deleteEvent
} from '../../../utils/gcal/calendarClient';
import type { FetchFn } from '../../../utils/gcal/oauth';

interface Call {
    url: string;
    method: string;
    body?: unknown;
}

function recorder(responder: (call: Call) => { status: number; body: unknown }): { fn: FetchFn; calls: Call[] } {
    const calls: Call[] = [];
    const fn = (async (url: string, init?: { method?: string; body?: string }) => {
        const call: Call = {
            url,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(init.body) : undefined
        };
        calls.push(call);
        const r = responder(call);
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
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
