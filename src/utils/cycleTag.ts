/**
 * Compute the next tag in the rotation given the current tag name and the list
 * of configured tag names.
 *
 * "ALL" is a virtual first entry that always exists, so the rotation always
 * starts and ends on it. An unknown current tag (e.g. left over after a
 * settings edit) deterministically falls back to "ALL" instead of silently
 * jumping to the first configured tag, which would surprise the user.
 */

export const TAG_ALL = 'ALL';

export function computeNextTag(currentTag: string, tagNames: readonly string[]): string {
    // "ALL" is always implicit at index 0 in the rotation. If the user has
    // also declared it in fileTags (the historical default), strip it out so
    // it doesn't appear twice and silently skip the rest of the cycle.
    const cycle = [TAG_ALL, ...tagNames.filter((n) => n !== TAG_ALL)];
    const currentIndex = cycle.indexOf(currentTag);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cycle.length;
    return cycle[nextIndex];
}
