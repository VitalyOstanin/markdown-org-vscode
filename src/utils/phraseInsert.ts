import { placeNewEntry } from './entryPlacement';

/**
 * Where a phrase-written entry goes in the file, and the text to write there.
 *
 * Kept free of `vscode` for the same reason as `entryPlacement`: the rule is
 * unit-tested against the text of a document rather than against one open in
 * an extension host. The line endings of the file are followed rather than
 * assumed -- a note written with CRLF gets CRLF back.
 */

export interface PhraseInsertOptions {
    /** The whole document, as one string. */
    text: string;
    /** The note the cursor stands in, or `null` when there is none above it. */
    headingLine: number | null;
    /** Where the cursor is, which is where an entry joining no note goes. */
    cursorLine: number;
    /**
     * The lines of the entry, built from the level and the indent the place
     * it lands asks for. A function rather than a list because both are
     * answers of the placement, and the placement is worked out here.
     */
    entry: (placement: { hashes: string; indent: string }) => readonly string[];
}

export interface PhraseInsertPlan {
    /** Index of the line the text is inserted before. */
    line: number;
    /** The text to insert, blank lines and line endings included. */
    text: string;
    /** The `#` run the entry's heading was written with. */
    hashes: string;
    /** The indent its planning line was written with. */
    indent: string;
}

/** The line ending the file uses, taken from the file rather than assumed. */
export function endOfLine(text: string): string {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Split a document into lines whichever ending it was written with. */
export function documentLines(text: string): string[] {
    return text.split(/\r?\n/);
}

export function planPhraseInsert(options: PhraseInsertOptions): PhraseInsertPlan {
    const { text, headingLine, cursorLine, entry } = options;
    const eol = endOfLine(text);
    const lines = documentLines(text);
    const placement = placeNewEntry(lines, headingLine, cursorLine);
    const body = entry({ hashes: placement.hashes, indent: placement.indent }).join(eol);

    return {
        line: placement.line,
        text: `${placement.blankBefore ? eol : ''}${body}${eol}${placement.blankAfter ? eol : ''}`,
        hashes: placement.hashes,
        indent: placement.indent
    };
}
