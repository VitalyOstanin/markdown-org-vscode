import { CLOCK_REGEX, TIMESTAMP_LINE_REGEX } from '../orgPatterns';

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
 *   * Any other line terminates the search.
 */
export function findClockLinesInLines(lines: string[], headingLine: number): number[] {
    const clockLines: number[] = [];
    for (let i = headingLine + 1; i < lines.length; i++) {
        const text = lines[i];

        if (TIMESTAMP_LINE_REGEX.test(text)) {
            continue;
        }

        if (CLOCK_REGEX.test(text)) {
            clockLines.push(i);
            continue;
        }

        if (text.trim() === '' && clockLines.length > 0) {
            continue;
        }

        break;
    }
    return clockLines;
}
