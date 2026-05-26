export interface DebouncedFunction<A extends unknown[]> {
    (...args: A): void;
    /** Drop a pending invocation, if any. */
    cancel(): void;
}

/**
 * Wrap `fn` so that rapid calls collapse into a single trailing invocation:
 * the wrapped function (re)starts a `delayMs` timer on every call and only
 * runs `fn` -- with the arguments from the last call -- once the calls stop
 * for `delayMs`. `cancel()` drops any pending invocation.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): DebouncedFunction<A> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const wrapped = (...args: A): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = undefined;
            fn(...args);
        }, delayMs);
    };

    wrapped.cancel = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    };

    return wrapped;
}
