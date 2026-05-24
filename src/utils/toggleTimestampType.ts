import type { TimestampLineMatch, TimestampLineKeyword } from '../orgPatterns';

export const CYCLE_ORDER: ReadonlyArray<TimestampLineKeyword> = ['SCHEDULED', 'DEADLINE', 'CLOSED', 'CREATED'];

const ACTIVE_KEYWORDS: ReadonlySet<TimestampLineKeyword> = new Set(['SCHEDULED', 'DEADLINE']);

/**
 * Cycle SCHEDULED -> DEADLINE -> CLOSED -> CREATED -> SCHEDULED.
 *
 * Per ADR-0005 the bracket form is bound to the keyword (SCHEDULED /
 * DEADLINE -> `<...>`; CLOSED / CREATED -> `[...]`), so each transition
 * also flips the bracket pair when the canonical form differs.
 *
 * `usedKeywords` lists the keyword lines that already exist for the
 * same heading (the cursor line itself MUST NOT be in the set -- its
 * current keyword is being replaced and its slot frees up). The cycle
 * skips those types so a heading never accumulates duplicates. If every
 * other slot is occupied the current keyword is preserved (no-op),
 * because there is no non-duplicate target available.
 */
export function cycleTimestampKeyword(
    hit: TimestampLineMatch,
    usedKeywords: ReadonlySet<TimestampLineKeyword> = EMPTY_SET
): string {
    const { indent, type, timestamp } = hit;

    const currentIndex = CYCLE_ORDER.indexOf(type);
    if (currentIndex === -1) {
        return `${indent}\`${type}: ${timestamp}\``;
    }

    let newType: TimestampLineKeyword = type;
    for (let step = 1; step <= CYCLE_ORDER.length; step++) {
        const candidate = CYCLE_ORDER[(currentIndex + step) % CYCLE_ORDER.length];
        if (candidate === type || !usedKeywords.has(candidate)) {
            newType = candidate;
            break;
        }
    }

    const newTimestamp = normaliseBracket(timestamp, ACTIVE_KEYWORDS.has(newType));
    return `${indent}\`${newType}: ${newTimestamp}\``;
}

const EMPTY_SET: ReadonlySet<TimestampLineKeyword> = new Set();

/** Convert `<...>` <-> `[...]` to satisfy the target activeness. Preserves contents. */
export function normaliseBracket(timestamp: string, active: boolean): string {
    if (timestamp.length < 2) return timestamp;
    const inner = timestamp.slice(1, -1);
    return active ? `<${inner}>` : `[${inner}]`;
}
