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
import { group } from './regexGroups';

export function extractHeadingBlockLines(lines: string[], startLine: number, level: number): string[] {
    const first = lines[startLine];
    const out: string[] = first === undefined ? [] : [first];
    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) break;
        const match = /^(#+)\s+/.exec(line);
        if (match && group(match, 1).length <= level) {
            break;
        }
        out.push(line);
    }
    return out;
}
