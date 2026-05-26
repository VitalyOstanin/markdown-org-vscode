// Pure, vscode-free helpers for the on-disk `org-properties` block
// (markdown-org-vscode ADR-0009). The block is a fenced code block with
// the info string `org-properties` holding bare `KEY: value` lines, placed
// under a heading and its planning (SCHEDULED/DEADLINE/CREATED/CLOSED)
// lines. These functions operate on arrays of document lines so they can be
// unit-tested without the editor; the editor binding (WorkspaceEdit) lives
// with the consumer (calendar sync), not here.
import { matchTimestampLine } from '../orgPatterns';

/** Info string that marks a property block. Exact match, no extra attrs. */
const ORG_PROPERTIES_INFO = 'org-properties';

/**
 * Build the lines of an `org-properties` block for `props`, keys sorted
 * ascending (matches the extractor's BTreeMap ordering for stable diffs).
 * Each line is prefixed with `indent`.
 */
export function buildOrgPropertiesBlock(props: Record<string, string>, indent = ''): string[] {
    const keys = Object.keys(props).sort();
    const body = keys.map((k) => {
        const v = props[k];
        return v === '' ? `${indent}${k}:` : `${indent}${k}: ${v}`;
    });
    return [`${indent}\`\`\`${ORG_PROPERTIES_INFO}`, ...body, `${indent}\`\`\``];
}

const OPEN_FENCE = /^\s*```org-properties\s*$/;
const CLOSE_FENCE = /^\s*```\s*$/;

/** Half-open line range `[startLine, endLineExclusive)` of a found block. */
export interface OrgPropertiesRange {
    startLine: number;
    endLineExclusive: number;
}

/**
 * Locate an `org-properties` block that belongs to the heading at
 * `headingLine`: skip the consecutive planning-line run after the heading,
 * then require an opening `org-properties` fence and find its closing fence.
 * Returns the half-open line range, or `null` if there is no such block (or
 * it is unterminated, in which case the caller must not corrupt the file).
 */
export function findOrgPropertiesBlock(lines: string[], headingLine: number): OrgPropertiesRange | null {
    let i = headingLine + 1;
    while (i < lines.length && matchTimestampLine(lines[i])) {
        i++;
    }
    if (i >= lines.length || !OPEN_FENCE.test(lines[i])) {
        return null;
    }
    const startLine = i;
    i++;
    while (i < lines.length && !CLOSE_FENCE.test(lines[i])) {
        i++;
    }
    if (i >= lines.length) {
        return null; // unterminated: refuse to guess a range
    }
    return { startLine, endLineExclusive: i + 1 };
}

/**
 * Indent to use for the block: taken from the first planning line after the
 * heading (so the block aligns with SCHEDULED/DEADLINE/...), or '' if there
 * are no planning lines.
 */
function deriveIndent(lines: string[], headingLine: number): string {
    const next = lines[headingLine + 1];
    const hit = next ? matchTimestampLine(next) : null;
    return hit ? hit.indent : '';
}

/**
 * Return a new line array with the task's `org-properties` block set to
 * `props`. If a block already exists (per `findOrgPropertiesBlock`) it is
 * replaced in place; otherwise a fresh block is inserted right after the
 * heading's planning-line run. Pure: `lines` is not mutated. Designed to be
 * adapted to a `WorkspaceEdit` by the calendar-sync consumer.
 */
export function upsertOrgProperties(lines: string[], headingLine: number, props: Record<string, string>): string[] {
    const indent = deriveIndent(lines, headingLine);
    const block = buildOrgPropertiesBlock(props, indent);
    const existing = findOrgPropertiesBlock(lines, headingLine);
    const result = [...lines];
    if (existing) {
        result.splice(existing.startLine, existing.endLineExclusive - existing.startLine, ...block);
        return result;
    }
    let insertAt = headingLine + 1;
    while (insertAt < lines.length && matchTimestampLine(lines[insertAt])) {
        insertAt++;
    }
    result.splice(insertAt, 0, ...block);
    return result;
}
