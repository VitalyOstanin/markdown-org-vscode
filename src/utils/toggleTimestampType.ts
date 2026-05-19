const TOGGLEABLE_TYPES = ['SCHEDULED', 'DEADLINE', 'CLOSED'] as const;

/**
 * Cycle SCHEDULED -> DEADLINE -> CLOSED -> SCHEDULED, leaving CREATED and any
 * unrecognised type untouched. The line text (indent + type + timestamp) is
 * reconstructed from the named groups on the supplied TIMESTAMP_LINE_REGEX
 * match.
 */
export function toggleTimestampType(match: RegExpMatchArray): string {
    const { indent, type: currentType, timestamp } = match.groups!;

    if (currentType === 'CREATED') {
        return `${indent}\`${currentType}: ${timestamp}\``;
    }

    const currentIndex = TOGGLEABLE_TYPES.indexOf(currentType as (typeof TOGGLEABLE_TYPES)[number]);
    if (currentIndex === -1) {
        // TIMESTAMP_LINE_REGEX only matches the four known types, so this
        // branch is defensive: if a future caller hands us an unknown type,
        // leave the line untouched instead of silently rotating it to
        // SCHEDULED (which is what (-1 + 1) % 3 used to do).
        return `${indent}\`${currentType}: ${timestamp}\``;
    }
    const newType = TOGGLEABLE_TYPES[(currentIndex + 1) % TOGGLEABLE_TYPES.length];
    return `${indent}\`${newType}: ${timestamp}\``;
}
