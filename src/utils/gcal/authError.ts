/**
 * The failure a second attempt cannot fix.
 *
 * Everything else on the way to the Calendar API is worth retrying -- a dropped
 * connection, a 5xx from the token endpoint, a 429 from the API. Authorization
 * is not: an account that was never connected stays unconnected, and a grant
 * the user revoked stays revoked. Told apart by their type rather than by the
 * text of their message, so the retry loop does not have to match on strings
 * (same reason `BusctlMissingError` exists in `dbus.ts`).
 */
export class GcalAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GcalAuthError';
    }
}
