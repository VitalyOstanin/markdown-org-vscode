/**
 * Readers for capture groups of a match that already succeeded.
 *
 * A group the pattern does not mark optional is filled whenever the pattern
 * matched, but `noUncheckedIndexedAccess` types every read as possibly absent.
 * Falling back to an empty string would paper over the one case where the read
 * really can come back empty -- the pattern and the code reading it drifted
 * apart -- so these throw instead. Optional groups are not their business:
 * destructuring `match.groups` already types those as `string | undefined`,
 * which is what they are.
 */

/** Capture group `n` of a match, by position. */
export function group(match: RegExpMatchArray, n: number): string {
    const value = match[n];
    if (value === undefined) {
        throw new Error(`capture group ${n} is missing from the match of ${JSON.stringify(match[0])}`);
    }
    return value;
}

/** The named capture groups `keys`, read together. */
export function namedGroups<K extends string>(match: RegExpMatchArray, ...keys: K[]): Record<K, string> {
    const groups = match.groups;
    if (!groups) {
        throw new Error(`the match of ${JSON.stringify(match[0])} carries no named capture groups`);
    }
    const out = {} as Record<K, string>;
    for (const key of keys) {
        const value = groups[key];
        if (value === undefined) {
            throw new Error(`named capture group ${key} is missing from the match of ${JSON.stringify(match[0])}`);
        }
        out[key] = value;
    }
    return out;
}

/**
 * Split `value` into exactly `count` parts, or throw. For inputs whose shape a
 * pattern has already vouched for -- `YYYY-MM-DD` after an ISO date check,
 * `HH:MM` after a timestamp match -- where indexing the result would otherwise
 * read as unchecked. The return type is a tuple, so the parts destructure as
 * plain strings.
 */
export function splitInto(value: string, separator: string, count: 2): [string, string];
export function splitInto(value: string, separator: string, count: 3): [string, string, string];
export function splitInto(value: string, separator: string, count: number): string[] {
    const parts = value.split(separator);
    if (parts.length !== count) {
        throw new Error(
            `expected ${count} ${JSON.stringify(separator)}-separated parts in ${JSON.stringify(value)}, got ${parts.length}`
        );
    }
    return parts;
}
