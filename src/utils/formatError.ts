// Normalize unknown-typed errors to a string safe to show in a
// user-facing message. `${err}` on a plain object renders as
// "[object Object]"; falling back to String(err) keeps non-Error
// values readable while preserving the message of real Errors.
export function formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
