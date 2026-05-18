// Build an Error to reject with from a child_process exec callback.
// Keeps the user-facing message (stderr -> error.message -> fallback) but
// also attaches the original child_process error via Error.cause so the
// underlying exit code / signal / killed-state survive the Promise
// boundary for debugging. Accepts both ExecException and
// ExecFileException since execFile passes the latter -- typed loosely
// because both callbacks share the same `(error, stdout, stderr)` shape.
export function buildExecError(error: { message: string } | null, stderr: string, fallbackMessage: string): Error {
    const message = stderr || error?.message || fallbackMessage;
    return error ? new Error(message, { cause: error }) : new Error(message);
}
