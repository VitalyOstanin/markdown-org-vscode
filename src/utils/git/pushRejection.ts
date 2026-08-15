/**
 * Telling "the remote refused this push" from every other way a push can fail.
 *
 * A refusal is the one failure with a next step the user can take -- fetch what
 * is missing, then push again -- so it is answered with a sentence naming the
 * two branches instead of git's own multi-line stderr. Getting it wrong is
 * quiet: the user gets the raw output and has to read it.
 *
 * Its own module, free of `vscode`, so both signals can be unit-tested. Against
 * a real host only the signal that host emits is ever exercised, and which one
 * that is cannot be told from the outcome.
 */
import { formatError } from '../formatError';

/**
 * The error code the built-in extension attaches when the remote refuses a
 * non-fast-forward update. Read as a plain property because the API surface we
 * declare describes calls, not the errors they throw.
 */
const PUSH_REJECTED_CODE = 'PushRejected';

/**
 * Text of the same refusal, for the paths that do not carry the code -- an
 * older host, or a rejection reported by the remote's own hook rather than by
 * git's ref check. Same reason the mobile client watches two signals for it.
 */
const PUSH_REJECTED_TEXT_REGEX = /!\s*\[rejected]|non-fast-forward|fetch first|failed to push some refs/i;

/** Two signals for one refusal: the error code, then its text. */
export function isPushRejected(error: unknown): boolean {
    const carrier = error as { gitErrorCode?: unknown; stderr?: unknown } | null | undefined;
    if (carrier?.gitErrorCode === PUSH_REJECTED_CODE) {
        return true;
    }
    // The message and the captured stderr both count: the extension puts the
    // refusal in one or the other depending on how the push was run.
    const text = `${formatError(error)}\n${typeof carrier?.stderr === 'string' ? carrier.stderr : ''}`;
    return PUSH_REJECTED_TEXT_REGEX.test(text);
}
