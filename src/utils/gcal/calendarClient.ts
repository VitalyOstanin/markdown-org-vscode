import { GcalAuthError } from './authError';
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
 *
 * The delay is spread by `random`: several VS Code windows share the account,
 * not the lock (which covers one workspace directory), so a common 429 would
 * otherwise have all of them wake up at the same millisecond and retry in
 * lockstep. The exponential value is treated as an upper bound and the wait
 * lands anywhere in its upper half; a `Retry-After` is only ever extended,
 * since the server named the earliest time it will accept.
 */
export function computeRetryDelayMs(
    attempt: number,
    retryAfterMs: number | undefined,
    baseMs: number = RETRY_BASE_MS,
    capMs: number = RETRY_CAP_MS,
    random: () => number = Math.random
): number {
    if (retryAfterMs !== undefined) {
        return Math.min(retryAfterMs + baseMs * random(), capMs);
    }
    const full = Math.min(baseMs * 2 ** (attempt - 1), capMs);
    return full / 2 + (full / 2) * random();
}

/** Cooperative cancellation flag, the same shape the sync engine passes around. */
export interface CallOptions {
    signal?: { aborted: boolean } | undefined;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
let sleepImpl: (ms: number) => Promise<void> = defaultSleep;

/** Test seam: override the backoff sleep so retry paths run without real delay. */
export function setRetrySleepForTests(fn?: (ms: number) => Promise<void>): void {
    sleepImpl = fn ?? defaultSleep;
}

/**
 * Sleep, then report whether the wait was cancelled. Split into short steps so
 * an abort raised while the run is in its backoff takes effect right away: the
 * watchdog sets the flag exactly when another window is about to steal the
 * lock, and sleeping the remaining seconds out is time spent writing to a
 * calendar this run no longer holds the lease for.
 */
async function sleepUnlessAborted(ms: number, signal?: { aborted: boolean }): Promise<boolean> {
    if (!signal) {
        await sleepImpl(ms);
        return true;
    }
    const step = 100;
    let waited = 0;
    while (waited < ms) {
        if (signal.aborted) {
            return false;
        }
        const chunk = Math.min(step, ms - waited);
        await sleepImpl(chunk);
        waited += chunk;
    }
    return !signal.aborted;
}

async function call(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    method: string,
    path: string,
    body?: unknown,
    opts: CallOptions = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
    const send = async (forceRefresh: boolean) => {
        const token = await getToken(forceRefresh ? { forceRefresh: true } : undefined);
        const res = await fetchFn(`${BASE}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
            },
            // Spread rather than `body: ... : undefined`: `RequestInit.body` is
            // optional, and an explicit `undefined` is not the same as an
            // absent key once `exactOptionalPropertyTypes` is on.
            ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const retryAfter = res.headers.get('retry-after');
        return { status: res.status, json, retryAfter };
    };

    // Two separate things, previously one variable: whether the 401 branch has
    // already been taken (it is allowed once), and whether the *next* send
    // should force a token refresh. Conflated, a single 401 made every later
    // retry -- including the transient 429/5xx ones -- hit the token endpoint
    // again, up to three needless refreshes per API call.
    let refreshedOnce = false;
    let forceRefreshNext = false;
    let retries = 0;
    for (;;) {
        let r: Awaited<ReturnType<typeof send>>;
        try {
            r = await send(forceRefreshNext);
        } catch (err) {
            // No response at all: a dropped connection, a DNS or TLS failure, an
            // unreachable token endpoint. That is the most common transient
            // failure there is, and it used to bypass the retry loop entirely --
            // the loop only ever looked at status codes, so the rarer 5xx was
            // retried while this was handed straight to the caller, turning a
            // blip into a whole sync of failed tasks.
            //
            // Authorization is the exception: an account that is not connected
            // and a grant that was revoked stay that way, so the three backoffs
            // buy nothing and a sync run pays them once per task.
            if (err instanceof GcalAuthError || retries >= MAX_RETRIES || opts.signal?.aborted) {
                throw err;
            }
            retries++;
            if (!(await sleepUnlessAborted(computeRetryDelayMs(retries, undefined), opts.signal))) {
                throw new Error('calendar request aborted while waiting to retry', { cause: err });
            }
            forceRefreshNext = false;
            continue;
        }
        forceRefreshNext = false;
        if (r.status === 401 && !refreshedOnce) {
            // Token revoked or clock skew: one forced refresh + retry (spec error table).
            refreshedOnce = true;
            forceRefreshNext = true;
            continue;
        }
        if (isTransientStatus(r.status) && retries < MAX_RETRIES) {
            if (opts.signal?.aborted) {
                throw new Error('calendar request aborted');
            }
            retries++;
            const delay = computeRetryDelayMs(retries, parseRetryAfterMs(r.retryAfter, Date.now()));
            if (!(await sleepUnlessAborted(delay, opts.signal))) {
                throw new Error('calendar request aborted');
            }
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
    getToken: AccessTokenProvider,
    opts: CallOptions = {}
): Promise<CalendarSummary[]> {
    const { status, json } = await call(fetchFn, getToken, 'GET', '/users/me/calendarList', undefined, opts);
    if (status < 200 || status >= 300) {
        fail('list calendars', status, json);
    }
    const items = (json.items as CalendarSummary[] | undefined) ?? [];
    return items.filter((c) => WRITABLE.has(c.accessRole));
}

export async function ensureCalendar(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    opts: { name: string; pinnedId?: string | undefined }
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
    event: GcalEventResource,
    opts: CallOptions = {}
): Promise<InsertResult> {
    const { status, json } = await call(
        fetchFn,
        getToken,
        'POST',
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        event,
        opts
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
    event: GcalEventResource,
    opts: CallOptions = {}
): Promise<void> {
    const { status, json } = await call(
        fetchFn,
        getToken,
        'PATCH',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        event,
        opts
    );
    if (status < 200 || status >= 300) {
        fail('update event', status, json);
    }
}

export async function deleteEvent(
    fetchFn: FetchFn,
    getToken: AccessTokenProvider,
    calendarId: string,
    eventId: string,
    opts: CallOptions = {}
): Promise<void> {
    const { status, json } = await call(
        fetchFn,
        getToken,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        undefined,
        opts
    );
    // 404/410: event already gone -- treat as success (idempotent delete).
    if (status === 404 || status === 410 || (status >= 200 && status < 300)) {
        return;
    }
    fail('delete event', status, json);
}
