import * as assert from 'node:assert/strict';
import { runSync, type SyncDeps, type PropertiesWriter } from '../../../utils/gcal/syncEngine';
import type { Task } from '../../../types';
import type { FetchFn } from '../../../utils/gcal/oauth';

interface Call {
    url: string;
    method: string;
}

function recorder(responder: (c: Call) => { status: number; body: unknown }): { fn: FetchFn; calls: Call[] } {
    const calls: Call[] = [];
    const fn = (async (url: string, init?: { method?: string }) => {
        const call = { url, method: init?.method ?? 'GET' };
        calls.push(call);
        const r = responder(call);
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
    }) as unknown as FetchFn;
    return { fn, calls };
}

function recordingWriter(outcome: (file: string) => 'written' | 'deferred' = () => 'written'): {
    writer: PropertiesWriter;
    writes: { file: string; line: number; heading: string; props: Record<string, string> }[];
} {
    const writes: { file: string; line: number; heading: string; props: Record<string, string> }[] = [];
    return {
        writer: {
            write: async (file, line, heading, props) => {
                writes.push({ file, line, heading, props });
                return outcome(file);
            }
        },
        writes
    };
}

const TZ = 'Europe/Belgrade';
function baseDeps(tasks: Task[], fn: FetchFn, writer: PropertiesWriter): SyncDeps {
    return {
        tasks,
        fetchFn: fn,
        getToken: async () => 'AT',
        calendarId: 'cal',
        writer,
        genUuid: () => 'gen-0000-0000-0000-000000000000',
        mapOptions: (t) => ({ timeZone: TZ, defaultEventMinutes: 60, relPath: t.file }),
        onDone: 'delete'
    };
}

function task(partial: Partial<Task>): Task {
    return {
        file: '/w/n.md',
        line: 5,
        heading: 'H',
        content: '',
        timestamp_type: 'SCHEDULED',
        timestamp_active: true,
        timestamp_date: '2026-06-01',
        ...partial
    };
}

suite('gcal/syncEngine', () => {
    test('creates event, generates ID, writes ID and GCAL_EVENT_ID', async () => {
        const r = recorder((c) =>
            c.method === 'POST' ? { status: 200, body: { id: 'x' } } : { status: 200, body: {} }
        );
        const w = recordingWriter();
        const summary = await runSync(baseDeps([task({})], r.fn, w.writer));
        assert.equal(summary.created, 1);
        // ID generated then GCAL_EVENT_ID cached -> two property writes
        assert.equal(w.writes.length, 2);
        assert.equal(w.writes[0].props.ID, 'gen-0000-0000-0000-000000000000');
        assert.ok(w.writes[1].props.GCAL_EVENT_ID);
    });

    test('insert conflict (409) becomes update', async () => {
        const r = recorder((c) => {
            if (c.method === 'POST') return { status: 409, body: {} };
            if (c.method === 'PATCH') return { status: 200, body: {} };
            return { status: 200, body: {} };
        });
        const w = recordingWriter();
        const t = task({ properties: { ID: '11111111-2222-3333-4444-555555555555' } });
        const summary = await runSync(baseDeps([t], r.fn, w.writer));
        assert.equal(summary.updated, 1);
        assert.equal(summary.created, 0);
        assert.ok(r.calls.some((c) => c.method === 'PATCH'));
    });

    test('DONE with onDone=delete deletes the event', async () => {
        const r = recorder(() => ({ status: 200, body: {} }));
        const w = recordingWriter();
        const t = task({ task_type: 'DONE', properties: { ID: '11111111-2222-3333-4444-555555555555' } });
        const summary = await runSync(baseDeps([t], r.fn, w.writer));
        assert.equal(summary.deleted, 1);
        assert.ok(r.calls.some((c) => c.method === 'DELETE'));
    });

    test('unsyncable task with linkage is deleted; without linkage is skipped', async () => {
        const r = recorder(() => ({ status: 200, body: {} }));
        const w = recordingWriter();
        const linked = task({ timestamp_active: false, properties: { GCAL_EVENT_ID: 'abc' } });
        const orphanless = task({ timestamp_active: false });
        const summary = await runSync(baseDeps([linked, orphanless], r.fn, w.writer));
        assert.equal(summary.deleted, 1);
        assert.equal(summary.skipped, 1);
    });

    test('stops early when the abort signal is set', async () => {
        const r = recorder(() => ({ status: 200, body: { id: 'x' } }));
        const w = recordingWriter();
        const deps = baseDeps([task({}), task({})], r.fn, w.writer);
        deps.signal = { aborted: true };
        const summary = await runSync(deps);
        assert.equal(summary.created, 0);
    });

    test('deferred new-ID write skips the insert (no orphan event)', async () => {
        const r = recorder(() => ({ status: 200, body: { id: 'x' } }));
        const w = recordingWriter(() => 'deferred');
        const summary = await runSync(baseDeps([task({})], r.fn, w.writer));
        assert.equal(summary.created, 0, 'no event created when the ID could not be persisted');
        assert.equal(summary.deferred, 1);
        assert.ok(!r.calls.some((c) => c.method === 'POST'), 'insert is skipped');
    });
});
