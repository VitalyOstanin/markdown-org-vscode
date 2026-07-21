import type { FetchFn } from './oauth';
import type { AccessTokenProvider } from './accessToken';
import type { CalendarSummary, GcalEventResource } from './types';

const BASE = 'https://www.googleapis.com/calendar/v3';
const WRITABLE = new Set(['owner', 'writer']);

// Transient-error retry policy for the Google Calendar API. 429 (rate limit)
// and 5xx (server errors) are retried with exponential backoff; every other
// status (including 4xx other than 429) is returned to the caller as-is.
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 8_000;

/** True when a status should be retried with backoff (429 or any 5xx). */
export function isTransientStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600);
}

/**
 * Parse a `Retry-After` header value into milliseconds, or undefined when
 * absent/unparseable. Supports both the delta-seconds form (`"12"`) and the
 * HTTP-date form (`"Wed, 21 Oct 2026 07:28:00 GMT"`), per RFC 9110.
 */
export function parseRetryAfterMs(value: string | null | undefined, nowMs: number): number | undefined {
    if (value == null) {
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
        return undefined;
    }
    if (/^\d+$/.test(trimmed)) {
        return Number(trimmed) * 1000;
    }
    const dateMs = Date.parse(trimmed);
    if (Number.isNaN(dateMs)) {
        return undefined;
    }
    return Math.max(0, dateMs - nowMs);
}

/**
 * Backoff delay (ms) before retry number `attempt` (1-based). Honours a
 * server-provided `Retry-After` (in ms) when present, otherwise uses
 * exponential backoff `base * 2^(attempt-1)`. Always clamped to `capMs`.
 */
export function computeRetryDelayMs(
    attempt: number,
    retryAfterMs: number | undefined,
    baseMs: number = RETRY_BASE_MS,
    capMs: number = RETRY_CAP_MS
): number {
    if (retryAfterMs !== undefined) {
        return Math.min(retryAfterMs, capMs);
    }
    return Math.min(baseMs * 2 ** (attempt - 1), capMs);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
let sleepImpl: (ms: number) => Promise<void> = defaultSleep;

/** Test seam: override the backoff sleep so retry paths run without real delay. */
export function setRetrySleepForTests(fn?: (ms: number) => Promise<void>): void {
    sleepImpl = fn ?? defaultSleep;
}

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
        const retryAfter =
            (res as { headers?: { get?: (name: string) => string | null } }).headers?.get?.('retry-after') ?? null;
        return { status: res.status, json, retryAfter };
    };

    let refreshed = false;
    let retries = 0;
    for (;;) {
        const r = await send(refreshed);
        if (r.status === 401 && !refreshed) {
            // Token revoked or clock skew: one forced refresh + retry (spec error table).
            refreshed = true;
            continue;
        }
        if (isTransientStatus(r.status) && retries < MAX_RETRIES) {
            retries++;
            const delay = computeRetryDelayMs(retries, parseRetryAfterMs(r.retryAfter, Date.now()));
            await sleepImpl(delay);
            continue;
        }
        return { status: r.status, json: r.json };
    }
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
