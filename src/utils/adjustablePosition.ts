import { HEADING_REGEX, matchTimestampLine } from '../orgPatterns';
import { getTimestampPartAt, getClockTimestampPartAt } from './timestampParts';

/**
 * Whether Shift+Up/Down on `character` of `lineText` would act on something
 * (adjust a date/time/keyword/status/priority) rather than fall through to the
 * built-in line selection in `adjustTimestamp` (timestampEdit.ts:349).
 *
 * The four checks mirror, in the same order, the detectors `adjustTimestamp`
 * runs: CLOCK part, plain timestamp part, timestamp keyword (outside the
 * bracketed body), heading status/priority token. The keybinding context key
 * is derived from this predicate, so any change to the detectors here or in
 * timestampEdit.ts must be reflected in the other. Pure (no `vscode`) so the
 * mapping stays unit-testable.
 */
export function isAdjustablePosition(lineText: string, character: number): boolean {
    if (getClockTimestampPartAt(lineText, character)) return true;
    if (getTimestampPartAt(lineText, character)) return true;
    if (isOnTimestampKeyword(lineText, character)) return true;
    if (isOnHeadingStatusOrPriority(lineText, character)) return true;
    return false;
}

export interface AdjustGateInput {
    languageId: string;
    /** Number of active selections (carets). */
    selectionCount: number;
    /** Whether the primary selection is a bare caret (no range). */
    selectionEmpty: boolean;
    lineText: string;
    character: number;
}

/**
 * Decide whether Shift+Up/Down should be claimed by `adjustTimestamp` instead
 * of extending the selection -- the value behind the
 * `markdown-org.timestampAdjustable` when-context (#10). True only for a
 * single bare caret on an adjustable token in a markdown editor: a non-empty
 * selection (mid-selection over a heading/timestamp) or multiple carets must
 * always fall through to the built-in `cursorUpSelect`/`cursorDownSelect`.
 *
 * Pure so the gating is unit-tested directly, without the async selection
 * events / active-editor focus that made an integration-level test flaky.
 */
export function shouldGateTimestampAdjust(input: AdjustGateInput): boolean {
    if (input.languageId !== 'markdown') return false;
    if (input.selectionCount !== 1) return false;
    if (!input.selectionEmpty) return false;
    return isAdjustablePosition(input.lineText, input.character);
}

/**
 * Mirrors `getTimestampTypeAtCursor`: a timestamp keyword line is adjustable
 * everywhere OUTSIDE the bracketed body (the backtick, keyword token, colon,
 * gap, trailing backtick all cycle the keyword). Columns inside `<...>` /
 * `[...]` belong to the timestamp-part adapter instead.
 */
function isOnTimestampKeyword(lineText: string, character: number): boolean {
    const hit = matchTimestampLine(lineText);
    if (!hit) return false;
    const timestampStart = lineText.indexOf(hit.timestamp);
    if (timestampStart >= 0) {
        const timestampEnd = timestampStart + hit.timestamp.length;
        if (character >= timestampStart && character < timestampEnd) {
            return false;
        }
    }
    return true;
}

/**
 * Mirrors `getHeadingPartAtCursor`: adjustable when the cursor sits on the
 * `TODO`/`DONE` status token or the `[#priority]` cookie of a heading. End
 * bounds are inclusive, matching the cursor-detector.
 */
function isOnHeadingStatusOrPriority(lineText: string, character: number): boolean {
    const match = lineText.match(HEADING_REGEX);
    if (!match?.groups) return false;

    const { hashes, status, priority } = match.groups;
    const hashesEnd = hashes.length + 1;

    if (status) {
        const statusStart = lineText.indexOf(status, hashesEnd);
        const statusEnd = statusStart + status.length;
        if (character >= statusStart && character <= statusEnd) return true;
    }

    if (priority) {
        const priorityPattern = `[#${priority}]`;
        const priorityStart = lineText.indexOf(priorityPattern);
        const priorityEnd = priorityStart + priorityPattern.length;
        if (character >= priorityStart && character <= priorityEnd) return true;
    }

    return false;
}
