import type { FetchFn } from './oauth';
import type { AccessTokenProvider } from './accessToken';
import type { CalendarSummary, GcalEventResource } from './types';

const BASE = 'https://www.googleapis.com/calendar/v3';
const WRITABLE = new Set(['owner', 'writer']);

async function call(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    method: string,
    path: string,
    body?: unknown
): Promise<{ status: number; json: Record<string, unknown> }> {
    const send = async (forceRefresh: boolean) => {
        const token = await getToken(forceRefresh ? { forceRefresh: true } : undefined);
        const res = await fetchFn(`${BASE}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return { status: res.status, json };
    };
    let r = await send(false);
    if (r.status === 401) {
        // Token revoked or clock skew: one forced refresh + retry (spec error table).
        r = await send(true);
    }
    return r;
}

function fail(ctx: string, status: number, json: Record<string, unknown>): never {
    const err = (json.error as { message?: string } | undefined)?.message ?? `HTTP ${status}`;
    throw new Error(`${ctx} failed: ${err}`);
}

export async function listWritableCalendars(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider
): Promise<CalendarSummary[]> {
    const { status, json } = await call(fetchFn, getToken, 'GET', '/users/me/calendarList');
    if (status < 200 || status >= 300) {
        fail('list calendars', status, json);
    }
    const items = (json.items as CalendarSummary[] | undefined) ?? [];
    return items.filter((c) => WRITABLE.has(c.accessRole));
}

export async function ensureCalendar(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    opts: { name: string; pinnedId?: string }
): Promise<string> {
    if (opts.pinnedId) {
        const { status, json } = await call(
            fetchFn,
            getToken,
            'GET',
            `/calendars/${encodeURIComponent(opts.pinnedId)}`
        );
        if (status >= 200 && status < 300) {
            return opts.pinnedId;
        }
        fail(`pinned calendar "${opts.pinnedId}"`, status, json);
    }
    const cals = await listWritableCalendars(fetchFn, getToken);
    const found = cals.find((c) => c.summary === opts.name);
    if (found) {
        return found.id;
    }
    const { status, json } = await call(fetchFn, getToken, 'POST', '/calendars', { summary: opts.name });
    if (status < 200 || status >= 300) {
        fail('create calendar', status, json);
    }
    const id = json.id;
    if (typeof id !== 'string') {
        throw new Error('create calendar returned no id');
    }
    return id;
}

export type InsertResult = { status: 'created'; event: Record<string, unknown> } | { status: 'conflict' };

export async function insertEvent(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    calendarId: string,
    event: GcalEventResource
): Promise<InsertResult> {
    const { status, json } = await call(
        fetchFn,
        getToken,
        'POST',
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        event
    );
    if (status === 409) {
        return { status: 'conflict' };
    }
    if (status < 200 || status >= 300) {
        fail('insert event', status, json);
    }
    return { status: 'created', event: json };
}

export async function patchEvent(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    calendarId: string,
    eventId: string,
    event: GcalEventResource
): Promise<void> {
    const { status, json } = await call(
        fetchFn,
        getToken,
        'PATCH',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        event
    );
    if (status < 200 || status >= 300) {
        fail('update event', status, json);
    }
}

export async function deleteEvent(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    calendarId: string,
    eventId: string
): Promise<void> {
    const { status, json } = await call(
        fetchFn,
        getToken,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    );
    // 404/410: event already gone -- treat as success (idempotent delete).
    if (status === 404 || status === 410 || (status >= 200 && status < 300)) {
        return;
    }
    fail('delete event', status, json);
}
