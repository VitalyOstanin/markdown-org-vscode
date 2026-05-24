import type { TimestampLineMatch, TimestampLineKeyword } from '../orgPatterns';

const CYCLE_ORDER: ReadonlyArray<TimestampLineKeyword> = ['SCHEDULED', 'DEADLINE', 'CLOSED'];

const ACTIVE_KEYWORDS: ReadonlySet<TimestampLineKeyword> = new Set(['SCHEDULED', 'DEADLINE']);

/**
 * Cycle SCHEDULED -> DEADLINE -> CLOSED -> SCHEDULED, leaving CREATED untouched.
 *
 * Per ADR-0014 the bracket form is bound to the keyword:
 *   SCHEDULED / DEADLINE -> active `<...>`
 *   CLOSED               -> inactive `[...]`
 * so each transition also flips the bracket pair when the canonical form
 * differs from the source.
 */
export function cycleTimestampKeyword(hit: TimestampLineMatch): string {
    const { indent, type, timestamp } = hit;

    if (type === 'CREATED') {
        return `${indent}\`${type}: ${timestamp}\``;
    }

    const currentIndex = CYCLE_ORDER.indexOf(type);
    if (currentIndex === -1) {
        return `${indent}\`${type}: ${timestamp}\``;
    }
    const newType = CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length];
    const newTimestamp = normaliseBracket(timestamp, ACTIVE_KEYWORDS.has(newType));
    return `${indent}\`${newType}: ${newTimestamp}\``;
}

/** Convert `<...>` <-> `[...]` to satisfy the target activeness. Preserves contents. */
export function normaliseBracket(timestamp: string, active: boolean): string {
    if (timestamp.length < 2) return timestamp;
    const inner = timestamp.slice(1, -1);
    return active ? `<${inner}>` : `[${inner}]`;
}
