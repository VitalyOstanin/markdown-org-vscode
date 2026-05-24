import type { TimestampLineMatch, TimestampLineKeyword } from '../orgPatterns';

export const CYCLE_ORDER: ReadonlyArray<TimestampLineKeyword> = ['SCHEDULED', 'DEADLINE', 'CLOSED', 'CREATED'];

const ACTIVE_KEYWORDS: ReadonlySet<TimestampLineKeyword> = new Set(['SCHEDULED', 'DEADLINE']);

export interface CycleResult {
    /** Rewritten line, ready to replace the document line in one edit. */
    line: string;
    /** Keyword the cursor was on. */
    from: TimestampLineKeyword;
    /** Keyword chosen by the cycle. Equals `from` only when every other slot was occupied. */
    to: TimestampLineKeyword;
    /**
     * Keywords the cycle walked past because they were already present
     * on a sibling line. Order matches the cycle's natural step
     * direction (CYCLE_ORDER, starting from `from + 1`). Empty when no
     * skip happened. Callers use this for a "skipped X, Y" status hint.
     */
    skipped: TimestampLineKeyword[];
}

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
 * other slot is occupied, `to` equals `from` (no-op) and `skipped`
 * lists every walked-past type so the UI can explain why nothing
 * moved.
 */
export function cycleTimestampKeyword(
    hit: TimestampLineMatch,
    usedKeywords: ReadonlySet<TimestampLineKeyword> = EMPTY_SET
): CycleResult {
    const { indent, type, timestamp } = hit;

    const currentIndex = CYCLE_ORDER.indexOf(type);
    if (currentIndex === -1) {
        return { line: `${indent}\`${type}: ${timestamp}\``, from: type, to: type, skipped: [] };
    }

    const skipped: TimestampLineKeyword[] = [];
    let newType: TimestampLineKeyword = type;
    for (let step = 1; step <= CYCLE_ORDER.length; step++) {
        const candidate = CYCLE_ORDER[(currentIndex + step) % CYCLE_ORDER.length];
        if (candidate === type) {
            // Wrapped around without finding a free slot -- preserve current type.
            newType = candidate;
            break;
        }
        if (!usedKeywords.has(candidate)) {
            newType = candidate;
            break;
        }
        skipped.push(candidate);
    }

    const newTimestamp = normaliseBracket(timestamp, ACTIVE_KEYWORDS.has(newType));
    return {
        line: `${indent}\`${newType}: ${newTimestamp}\``,
        from: type,
        to: newType,
        skipped
    };
}

const EMPTY_SET: ReadonlySet<TimestampLineKeyword> = new Set();

/** Convert `<...>` <-> `[...]` to satisfy the target activeness. Preserves contents. */
export function normaliseBracket(timestamp: string, active: boolean): string {
    if (timestamp.length < 2) return timestamp;
    const inner = timestamp.slice(1, -1);
    return active ? `<${inner}>` : `[${inner}]`;
}
