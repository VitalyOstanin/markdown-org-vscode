import { setTimeout as sleep } from 'node:timers/promises';
import { AgendaPanel } from '../../views/agendaPanel';

/**
 * Waiting helpers shared by the integration suites.
 *
 * A fixed `sleep` is wrong in both directions: on a loaded machine (the whole
 * suite runs under one xvfb) the step can take longer and the test fails for a
 * reason unrelated to the code, and when it is quick the suite still pays the
 * full pause. Every wait here polls the condition it actually cares about and
 * fails with what it last saw.
 */

/**
 * Poll `condition` until it holds; throw with `what` when the deadline passes.
 * The condition may be asynchronous -- some of what is waited for (the git
 * status of a repository) can only be read by awaiting it.
 */
export async function waitUntil(
    condition: () => boolean | Promise<boolean>,
    what: string,
    timeoutMs = 8000
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
        if (Date.now() >= deadline) {
            throw new Error(`${what} did not hold within ${timeoutMs}ms`);
        }
        await sleep(25);
    }
}

/**
 * Wait until a value settles on what the test expects, reporting the last value
 * seen. For side effects that are not a render: a setting written back, a
 * context key flipped, a spy called.
 */
export async function waitForValue<T>(read: () => T, expected: T, what: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = read();
    while (last !== expected) {
        if (Date.now() >= deadline) {
            throw new Error(`${what} did not become ${String(expected)} within ${timeoutMs}ms (last: ${String(last)})`);
        }
        await sleep(25);
        last = read();
    }
}

/**
 * Wait until the panel has rendered, optionally in a given mode.
 *
 * `queryRenderedInfoForTesting` round-trips through the page, so a successful
 * answer means the current render is on screen. `expectedMode` guards against
 * reading the *previous* render when a test switches views.
 */
export async function waitForAgendaRender(expectedMode?: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    for (;;) {
        try {
            const info = await AgendaPanel.queryRenderedInfoForTesting(500);
            if (info && (!expectedMode || info.mode === expectedMode)) {
                return;
            }
            lastError = info ? `mode is "${info.mode}"` : 'no panel open';
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }
        if (Date.now() >= deadline) {
            const wanted = expectedMode ? ` in mode "${expectedMode}"` : '';
            throw new Error(`agenda did not render${wanted} within ${timeoutMs}ms (${String(lastError)})`);
        }
        await sleep(50);
    }
}

/**
 * Wait until the open panel reports the given header layout. A settings change
 * reaches the page through the configuration listener and a message, so the
 * layout lands a tick or two after `config.update` resolves.
 */
export async function waitForHeaderLayout(expected: 'full' | 'compact', timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const info = await AgendaPanel.queryRenderedInfoForTesting(500).catch(() => null);
        if (info?.headerLayout === expected) {
            return;
        }
        const last = info ? info.headerLayout : 'no panel open';
        if (Date.now() >= deadline) {
            throw new Error(`header layout did not become "${expected}" within ${timeoutMs}ms (last: ${last})`);
        }
        await sleep(50);
    }
}
