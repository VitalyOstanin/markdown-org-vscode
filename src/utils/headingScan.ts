import type { TextDocument } from 'vscode';
import { HEADING_REGEX, TimestampLineKeyword } from '../orgPatterns';

/**
 * Cheap recogniser for "what keyword does this line declare?". Avoids the
 * full TIMESTAMP_LINE_REGEX (which parses the bracketed body) because the
 * keyword name is all the duplicate-detection scan needs.
 */
const KEYWORD_PREFIX_REGEX = /^\s*`(SCHEDULED|DEADLINE|CLOSED|CREATED):/;

const ALL_KEYWORDS_COUNT = 4;

/**
 * Shared scan behind both public entry points. Lines are read through the
 * `getLine` accessor rather than a materialized array, so the TextDocument
 * adapter stays lazy -- `lineAt` is called only for the lines actually
 * visited, and the loop still stops at the section boundary. Materializing
 * the whole document (e.g. `getText().split('\n')`) on every Shift+Up/Down
 * would defeat that.
 */
function scanSiblingKeywords(
    getLine: (index: number) => string,
    lineCount: number,
    cursorLine: number
): Set<TimestampLineKeyword> {
    const used = new Set<TimestampLineKeyword>();

    let sectionStart = 0;
    for (let i = cursorLine - 1; i >= 0; i--) {
        if (HEADING_REGEX.test(getLine(i))) {
            sectionStart = i + 1;
            break;
        }
    }

    for (let i = sectionStart; i < lineCount; i++) {
        if (i === cursorLine) continue;
        const text = getLine(i);
        if (HEADING_REGEX.test(text)) break;
        const m = KEYWORD_PREFIX_REGEX.exec(text);
        if (m) {
            used.add(m[1] as TimestampLineKeyword);
            if (used.size === ALL_KEYWORDS_COUNT) break;
        }
    }

    return used;
}

/**
 * Pure variant of {@link collectSiblingKeywords} that operates on a
 * plain string array. Kept separate so unit tests can exercise the
 * scan without instantiating a VS Code `TextDocument` mock. Scan
 * semantics match the adapter below.
 */
export function collectSiblingKeywordsFromLines(
    lines: ReadonlyArray<string>,
    cursorLine: number
): Set<TimestampLineKeyword> {
    return scanSiblingKeywords((i) => lines[i], lines.length, cursorLine);
}

/**
 * Collect the set of `SCHEDULED:` / `DEADLINE:` / `CLOSED:` / `CREATED:`
 * keywords already declared on sibling lines inside the same heading
 * section as `cursorLine`. The cursor line itself is excluded -- its
 * keyword is about to be replaced by the cycle, so the slot is free.
 *
 * Scan boundaries are local: walk up to the nearest `HEADING_REGEX`
 * line (the section start), then down until the next heading or EOF.
 * Sections are typically a handful of lines, so this is cheap enough
 * to run on every Shift+Up/Down without any caching layer. As soon as
 * all four possible keywords have been observed the scan exits early.
 *
 * If the cursor sits above the first heading (raw timestamps in a
 * preamble), the scan starts at line 0 -- same idea, just no anchor.
 */
export function collectSiblingKeywords(doc: TextDocument, cursorLine: number): Set<TimestampLineKeyword> {
    return scanSiblingKeywords((i) => doc.lineAt(i).text, doc.lineCount, cursorLine);
}
