/**
 * Compute coordinates for a Range that deletes `contentLength` lines starting
 * at `startLine`. The naive `Range(start, 0, lastLine + 1, 0)` form points
 * past EOF when the block touches the end of a file that has no trailing
 * newline; in that case VS Code leaves the trailing line behind. We close
 * the range on the actual end of the last existing line instead.
 *
 * This helper is decoupled from the `vscode` module so it can be unit-tested
 * without spinning up an extension host -- the caller wraps the result in a
 * `vscode.Range`.
 */

export interface MinDocument {
    readonly lineCount: number;
    /** Length (in characters) of the line at `lineIndex`. */
    getLineLength(lineIndex: number): number;
}

export interface BlockDeletionCoords {
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;
}

export function computeBlockDeletionCoords(
    doc: MinDocument,
    startLine: number,
    contentLength: number
): BlockDeletionCoords {
    const lastIdx = startLine + contentLength - 1;
    if (lastIdx >= doc.lineCount - 1) {
        const lastLineIdx = doc.lineCount - 1;
        return {
            startLine,
            startCharacter: 0,
            endLine: lastLineIdx,
            endCharacter: doc.getLineLength(lastLineIdx)
        };
    }
    return {
        startLine,
        startCharacter: 0,
        endLine: lastIdx + 1,
        endCharacter: 0
    };
}
