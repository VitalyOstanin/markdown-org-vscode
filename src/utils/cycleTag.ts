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

/**
 * Build the tag rotation: the implicit "ALL" at index 0 followed by the
 * configured tags, with any explicit "ALL" stripped so it never appears twice.
 *
 * A returned length of 1 (just "ALL") means the configuration has no tag to
 * rotate to -- empty `fileTags`, or every entry named "ALL". Callers should
 * treat that as a degenerate cycle and warn instead of silently looping.
 */
export function buildTagCycle(tagNames: readonly string[]): string[] {
    return [TAG_ALL, ...tagNames.filter((n) => n !== TAG_ALL)];
}

export function computeNextTag(currentTag: string, tagNames: readonly string[]): string {
    // An unknown current tag (e.g. left over after a settings edit) maps to -1
    // and deterministically falls back to "ALL" instead of jumping to the first
    // configured tag.
    const cycle = buildTagCycle(tagNames);
    const currentIndex = cycle.indexOf(currentTag);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cycle.length;
    return cycle[nextIndex];
}
