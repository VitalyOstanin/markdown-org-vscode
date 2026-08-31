import { matchTimestampLine } from '../orgPatterns';

/**
 * Where a new entry goes in the file it is written into.
 *
 * The entry joins the note the cursor stands in: it becomes the last thing
 * under that heading, one level deeper, after whatever already stands there
 * including the headings nested inside it. A file with no heading above the
 * cursor has no note to join, and the entry is written at the cursor as a
 * top-level heading.
 *
 * Kept free of `vscode` so the rule is unit-tested against arrays of lines
 * rather than against a document in an extension host.
 */

/** What the caller has to write, and where. */
export interface EntryPlacement {
    /** Index of the line the entry is inserted before. */
    line: number;
    /** Leading `#` run for the new heading. */
    hashes: string;
    /** Indent for the planning line under it. */
    indent: string;
    /** A blank line is needed above the entry: the line before it carries text. */
    blankBefore: boolean;
    /** A blank line is needed below: the entry does not end the file. */
    blankAfter: boolean;
}

/** The `#` run at the head of a line, or empty when the line is not a heading. */
function headingHashes(line: string): string {
    return /^(#+)\s/.exec(line)?.[1] ?? '';
}

/**
 * The indent the note writes its planning lines with, or four spaces.
 *
 * A note that already carries one answers for itself; one that does not is
 * given the indent the extension's own timestamp commands write, so a file
 * built entirely through this command reads the same as one built through
 * them.
 */
function planningIndent(lines: readonly string[], headingLine: number): string {
    for (let i = headingLine + 1; i < lines.length; i++) {
        const hit = matchTimestampLine(lines[i] ?? '');
        if (!hit) {
            break;
        }
        if (hit.indent !== '') {
            return hit.indent;
        }
    }
    return '    ';
}

/**
 * The line the note ends on: the first heading at its level or shallower,
 * with the blank lines before that heading left out.
 *
 * Trailing blanks belong to the gap between notes rather than to the note
 * above them, so an entry appended after them would drift a line further from
 * its own heading with every phrase written.
 */
function noteEnd(lines: readonly string[], headingLine: number, level: number): number {
    let end = lines.length;
    for (let i = headingLine + 1; i < lines.length; i++) {
        const hashes = headingHashes(lines[i] ?? '');
        if (hashes !== '' && hashes.length <= level) {
            end = i;
            break;
        }
    }
    while (end > headingLine + 1 && (lines[end - 1] ?? '').trim() === '') {
        end--;
    }
    return end;
}

/**
 * Decide where the entry lands.
 *
 * `headingLine` is the note the cursor stands in — what `findNearestHeading`
 * answers — or `null` when there is none above it.
 */
export function placeNewEntry(
    lines: readonly string[],
    headingLine: number | null,
    cursorLine: number
): EntryPlacement {
    // A line that is not a heading is not a note to join. `findNearestHeading`
    // asks the symbol provider first, and what that answers for a file without
    // headings is not guaranteed to be nothing -- an untitled buffer of plain
    // text came back with a symbol at line 0, which read as a note here and
    // put the entry at the end of the file instead of at the cursor.
    const level = headingLine === null ? 0 : headingHashes(lines[headingLine] ?? '').length;
    if (headingLine === null || level === 0) {
        const line = Math.min(Math.max(cursorLine, 0), lines.length);
        return {
            line,
            hashes: '#',
            indent: '    ',
            blankBefore: line > 0 && (lines[line - 1] ?? '').trim() !== '',
            blankAfter: line < lines.length && (lines[line] ?? '').trim() !== ''
        };
    }
    const line = noteEnd(lines, headingLine, level);
    return {
        line,
        hashes: '#'.repeat(level + 1),
        indent: planningIndent(lines, headingLine),
        blankBefore: line > 0 && (lines[line - 1] ?? '').trim() !== '',
        blankAfter: line < lines.length && (lines[line] ?? '').trim() !== ''
    };
}
