/**
 * Pure heading-block extractor: given an array of lines (typically the whole
 * document split by EOL), return the lines that belong to the heading starting
 * at `startLine` -- the heading line itself plus everything beneath it, up to
 * (but not including) the next heading of equal-or-higher level.
 *
 * Kept vscode-free so it can be unit-tested without booting an extension host.
 * The caller is responsible for one-shot reading the document text (e.g.
 * `document.getText().split(/\r?\n/)`) instead of N independent `lineAt(i).text`
 * calls -- which is the point of the indirection: one buffer scan + split is
 * cheaper than asking the TextDocument for each line individually on large
 * markdown files.
 */
export function extractHeadingBlockLines(lines: string[], startLine: number, level: number): string[] {
    const out: string[] = [lines[startLine]];
    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#+)\s+/);
        if (match && match[1].length <= level) {
            break;
        }
        out.push(line);
    }
    return out;
}
