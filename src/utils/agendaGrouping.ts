/**
 * Whether a day is split into named sections or drawn as one list.
 *
 * Its own module, away from the panel: the value comes out of the settings as a
 * free string, both the panel and the palette command have to make the same
 * sense of it, and the rule is worth a unit test on its own -- the panel drags
 * the whole webview in with it.
 */
export type AgendaGrouping = 'sections' | 'flat';

/** The two the page can draw, in the order the command steps through them. */
const GROUPINGS: AgendaGrouping[] = ['sections', 'flat'];

/**
 * The setting as one of the two values, whatever it says.
 *
 * Anything but `flat` is `sections`: that is the default, and a day with its
 * headings is the readable answer to a value nobody meant to write.
 */
export function normalizeGrouping(value: string | undefined): AgendaGrouping {
    return value === 'flat' ? 'flat' : 'sections';
}

/** The next value in the cycle, for the command that toggles the setting. */
export function nextGrouping(value: string | undefined): AgendaGrouping {
    const index = GROUPINGS.indexOf(normalizeGrouping(value));
    return GROUPINGS[(index + 1) % GROUPINGS.length] ?? 'sections';
}
