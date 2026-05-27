// Google Calendar event ids use base32hex: characters 0-9 and a-v, length
// 5..1024. A UUID with dashes removed and lowercased is 32 hex chars
// (0-9a-f), a valid subset. See the Calendar API events.insert id rules.
const EVENT_ID_RE = /^[0-9a-v]{5,1024}$/;

export function isValidEventId(id: string): boolean {
    return EVENT_ID_RE.test(id);
}

/** Derive a deterministic Calendar event id from a task's org-id `ID`. */
export function taskIdToEventId(orgId: string): string {
    const id = orgId.replace(/-/g, '').toLowerCase();
    if (!isValidEventId(id)) {
        throw new Error(`cannot derive a valid Google event id from ID "${orgId}"`);
    }
    return id;
}
