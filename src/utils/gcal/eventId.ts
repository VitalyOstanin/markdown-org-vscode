// Google Calendar event ids use base32hex: characters 0-9 and a-v, length
// 5..1024. A UUID with dashes removed and lowercased is 32 hex chars
// (0-9a-f), a valid subset. See the Calendar API events.insert id rules.
const EVENT_ID_REGEX = /^[0-9a-v]{5,1024}$/;

export function isValidEventId(id: string): boolean {
    return EVENT_ID_REGEX.test(id);
}

/** Derive a deterministic Calendar event id from a task's org-id `ID`. */
export function taskIdToEventId(orgId: string): string {
    const id = orgId.replaceAll('-', '').toLowerCase();
    if (!isValidEventId(id)) {
        throw new Error(`cannot derive a valid Google event id from ID "${orgId}"`);
    }
    return id;
}

/**
 * The event id for one occurrence held on another day (extractor ADR-0038).
 *
 * The occurrence has no `ID` of its own -- it is a line of the series -- so
 * its id is the series' with the day it left appended. That is deterministic,
 * which is what lets a second sync patch the event it wrote before instead of
 * making another, and it stays inside base32hex because the day is digits.
 */
export function movedEventId(orgId: string, occurrence: string): string {
    return `${taskIdToEventId(orgId)}${occurrence.replaceAll('-', '')}`;
}
