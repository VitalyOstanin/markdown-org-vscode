import * as cp from 'child_process';

/**
 * The one `execFile` shape this codebase uses: file, args, options with
 * `encoding: 'utf-8'` (or a timeout), and a callback taking string output.
 *
 * Spelled out rather than left to `typeof cp.execFile`, whose overload set
 * collapses to `any` through `.bind()` -- which then spreads as `any` into
 * every callback parameter and defeats type-aware linting at each call site.
 */
export type ExecFileCallback = (error: cp.ExecFileException | null, stdout: string, stderr: string) => void;

export type ExecFileFn = (
    file: string,
    args: readonly string[],
    options: cp.ExecFileOptionsWithStringEncoding | (cp.ExecFileOptions & { encoding?: BufferEncoding }),
    callback: ExecFileCallback
) => cp.ChildProcess;

// Wrapper object so tests can stub `execFile` without touching the non-configurable
// `child_process.execFile` descriptor that newer Node refuses to redefine.
export const exec: { execFile: ExecFileFn } = {
    execFile: cp.execFile.bind(cp)
};
