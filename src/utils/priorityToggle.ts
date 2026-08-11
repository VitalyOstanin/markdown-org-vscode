import { HEADING_REGEX, findPriorityCookie } from '../orgPatterns';
import { buildHeading } from './buildHeading';
import { namedGroups } from './regexGroups';
import { normalizeTaskType } from './normalizeTaskType';

/** Default for a heading that has no priority yet -- the top of the letter scale. */
const FRESH_PRIORITY = 'A';

/**
 * The heading line `togglePriority` should write, or `undefined` when `text` is
 * not a heading and nothing should be written.
 *
 * A cookie is cleared wherever it sits, and added only when the line carries
 * none. The extractor reads a cookie at any position (ADR-0027 there), so a
 * toggle that looked only at the canonical place saw none on
 * `## TODO Buy [#A] filter` and added a second one -- a line with two cookies,
 * one of them showing in the agenda and the other in the text.
 *
 * Clearing a cookie away from the canonical place cuts it out where it is,
 * together with one separating space, and leaves the rest of the title
 * byte-for-byte.
 */
export function planPriorityToggle(text: string): string | undefined {
    const match = HEADING_REGEX.exec(text);
    if (!match?.groups) {
        return undefined;
    }

    const { hashes, title } = namedGroups(match, 'hashes', 'title');
    const status = normalizeTaskType(match.groups.status);

    if (match.groups.priority !== undefined) {
        return buildHeading({ hashes, status, title });
    }

    const cookie = findPriorityCookie(title);
    if (cookie) {
        return buildHeading({ hashes, status, title: withoutCookie(title, cookie.start, cookie.end) });
    }

    return buildHeading({ hashes, status, priority: FRESH_PRIORITY, title });
}

/**
 * `title` with the cookie at `[start, end)` taken out.
 *
 * One adjacent space goes with it -- the one that separated the cookie from
 * the words -- so removing a cookie from the middle does not leave a double
 * space and removing a trailing one does not leave the line ending in a space.
 */
function withoutCookie(title: string, start: number, end: number): string {
    const before = title.slice(0, start);
    const after = title.slice(end);

    if (after.startsWith(' ')) {
        return before + after.slice(1);
    }
    if (before.endsWith(' ')) {
        return before.slice(0, -1) + after;
    }
    return before + after;
}
