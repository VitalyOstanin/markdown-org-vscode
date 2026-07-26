/**
 * Which date the agenda should be anchored on after the local day rolls over.
 *
 * The midnight timer used to refresh without an anchor, which kept whatever
 * `shiftedToday` the panel was opened with: a panel left open overnight asked
 * the extractor for yesterday, and in day mode showed it. But re-anchoring
 * unconditionally is wrong too -- a panel the user had navigated to another
 * week would jump away from where they left it.
 *
 * So the anchor follows the clock only when the panel was still showing the day
 * that just ended (`armedOn`, the date the timer was scheduled on). Any other
 * anchor is deliberate and is kept; the refresh still happens, so "today"
 * markers and the overdue/upcoming buckets are recomputed either way.
 */
export function resolveDayRolloverAnchor(currentAnchor: string | undefined, armedOn: string, today: string): string {
    if (!currentAnchor || currentAnchor === armedOn) {
        return today;
    }
    return currentAnchor;
}
