import type * as cp from 'node:child_process';

/**
 * The callback shape Node's `execFile` invokes. Every suite that stubs
 * `exec.execFile` needs it to narrow the last of the variadic arguments, so it
 * lives here instead of being re-declared in each of them.
 */
export type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

/** The payloads `makeExtractorFake` answers with, one per agenda mode. */
export interface ExtractorPayloads {
    day: unknown;
    week: unknown;
    /** Answer to `--agenda month-grid`, the call the month view makes. */
    month: unknown;
    tasks: unknown;
    /** Answer to `--holidays <year>`; an empty list when omitted. */
    holidays?: unknown;
}

/**
 * Build an `execFile` fake that hands back a different stdout depending on the
 * arguments the agenda code passes to `markdown-org-extract`.
 *
 * The wrapper supports the various Node `execFile` overloads (with/without
 * options) by always taking the callback from the last argument.
 */
export function makeExtractorFake(payloads: ExtractorPayloads) {
    return (..._args: unknown[]) => {
        const callback = _args.at(-1) as ExecFileCallback;
        const cliArgs = _args[1] as string[];
        let response: unknown = [];
        if (cliArgs.includes('--holidays')) {
            response = payloads.holidays ?? [];
        } else if (cliArgs.includes('--tasks')) {
            response = payloads.tasks;
        } else if (cliArgs.includes('--agenda')) {
            const mode = cliArgs[cliArgs.indexOf('--agenda') + 1];
            if (mode === 'day') response = payloads.day;
            else if (mode === 'week') response = payloads.week;
            // What the month view actually asks for: the grid the month is
            // drawn on, whole weeks and all (extractor 0.17.0).
            else if (mode === 'month-grid') response = payloads.month;
        }
        const stdout = JSON.stringify(response);
        queueMicrotask(() => {
            callback(null, stdout, '');
        });
        return {} as unknown as cp.ChildProcess;
    };
}
