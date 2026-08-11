import { CLOCK_LINE_LOOKALIKE_REGEX, CLOCK_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';

/**
 * Walk forward from the line after `headingLine` and collect indices of all
 * CLOCK entries that belong to the heading. The block ends at the first line
 * that is neither a TIMESTAMP, a CLOCK, nor an inner blank line.
 *
 * Specifically:
 *   * TIMESTAMP lines (CREATED/SCHEDULED/DEADLINE/CLOSED) are skipped silently
 *     -- they precede the CLOCK block, not part of it.
 *   * Blank lines that appear *after* the first CLOCK are allowed (so users
 *     can space CLOCK entries apart visually); blank lines that appear
 *     *before* the first CLOCK terminate the search to avoid skipping past
 *     unrelated paragraphs.
 *   * A line that says CLOCK but does not parse is passed over: it is a broken
 *     entry among the entries, not the prose that follows them.
 *   * Any other line terminates the search.
 */
export function findClockLinesInLines(lines: string[], headingLine: number): number[] {
    const clockLines: number[] = [];
    for (let i = headingLine + 1; i < lines.length; i++) {
        const text = lines[i];
        if (text === undefined) break;

        if (TIMESTAMP_LINE_REGEX.test(text)) {
            continue;
        }

        if (CLOCK_REGEX.test(text)) {
            clockLines.push(i);
            continue;
        }

        // A line that says CLOCK but does not parse is passed over rather than
        // treated as the end of the block: it is not a paragraph that follows
        // the entries, it is a broken entry among them, and the extractor --
        // which sweeps the file rather than walking a block -- goes on counting
        // the entries under it.
        if (CLOCK_LINE_LOOKALIKE_REGEX.test(text)) {
            continue;
        }

        if (text.trim() === '' && clockLines.length > 0) {
            continue;
        }

        break;
    }
    return clockLines;
}
