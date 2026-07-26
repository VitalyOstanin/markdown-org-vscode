export type ConcurrencyPolicy = 'queue' | 'cancel';

/** Cooperative-cancellation signal handed to a run; the task should check it. */
export interface RunHandle {
    aborted: boolean;
}

/**
 * Single-flight runner. At most one run executes at a time; while one runs, a
 * new request schedules at most one rerun (coalesced). With `cancel`, a new
 * request also aborts the in-flight run (cooperatively) before the rerun.
 */
export class SingleFlight {
    private running = false;
    private pending = false;
    private current?: RunHandle | undefined;

    constructor(private readonly policy: ConcurrencyPolicy) {}

    async run(task: (signal: RunHandle) => Promise<void>): Promise<void> {
        if (this.running) {
            this.pending = true;
            if (this.policy === 'cancel' && this.current) {
                this.current.aborted = true;
            }
            return;
        }
        this.running = true;
        try {
            do {
                this.pending = false;
                const handle: RunHandle = { aborted: false };
                this.current = handle;
                await task(handle);
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `run` sets this flag from outside the loop body
            } while (this.pending);
        } finally {
            this.running = false;
            this.current = undefined;
        }
    }
}
