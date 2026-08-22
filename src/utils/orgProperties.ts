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

// A fenced block as CommonMark defines it, which is what the extractor reads
// through comrak: three or more backticks or tildes, an optional indent, and
// an info string. The three clients have to agree on where a block is, or one
// writes a key the other never reads back -- and with the exception keys of
// the extractor's ADR-0031 that means a cancelled occurrence returning to the
// agenda. This mirrors the extractor: every block of the heading's section
// counts, whatever fences it, and the last one wins on a repeated key.
const FENCE = /^(\s*)(`{3,}|~{3,})\s*(.*)$/;
/** A markdown ATX heading, which ends the section a block can belong to. */
const HEADING = /^\s{0,3}#{1,6}(\s|$)/;

/** Half-open line range `[startLine, endLineExclusive)` of a found block. */
export interface OrgPropertiesRange {
    startLine: number;
    endLineExclusive: number;
}

/** The opening fence of a block, or null when the line is not one. */
function openingFence(line: string): { marker: string; info: string } | null {
    const m = FENCE.exec(line);
    if (!m) {
        return null;
    }
    const marker = m[2] ?? '';
    const info = (m[3] ?? '').trim();
    // A backtick fence cannot carry a backtick in its info string
    // (CommonMark); a tilde fence can carry anything.
    if (marker.startsWith('`') && info.includes('`')) {
        return null;
    }
    return { marker, info };
}

/** Whether `line` closes a block opened with `marker`: same char, not shorter, no info. */
function closesFence(line: string, marker: string): boolean {
    const m = FENCE.exec(line);
    if (!m) {
        return false;
    }
    const found = m[2] ?? '';
    return found.startsWith(marker[0] ?? '') && found.length >= marker.length && (m[3] ?? '').trim() === '';
}

/**
 * Every `org-properties` block of the section headed at `headingLine`, in
 * document order. The section runs to the next heading; a heading inside a
 * fenced block is text, not a heading, so fences are tracked while scanning.
 *
 * An unterminated block ends the search: what follows it is inside it as far
 * as any reader is concerned, and a caller must not edit a range it had to
 * guess at.
 */
export function findOrgPropertiesBlocks(lines: string[], headingLine: number): OrgPropertiesRange[] {
    const found: OrgPropertiesRange[] = [];
    let i = headingLine + 1;
    while (i < lines.length) {
        const line = lines[i] ?? '';
        const opening = openingFence(line);
        if (!opening) {
            if (HEADING.test(line)) {
                break;
            }
            i++;
            continue;
        }
        const startLine = i;
        let j = i + 1;
        while (j < lines.length && !closesFence(lines[j] ?? '', opening.marker)) {
            j++;
        }
        if (j >= lines.length) {
            break; // unterminated: refuse to guess a range
        }
        if (opening.info === ORG_PROPERTIES_INFO) {
            found.push({ startLine, endLineExclusive: j + 1 });
        }
        i = j + 1;
    }
    return found;
}

/**
 * The `org-properties` block a write to this heading has to land in: the last
 * one of the section, because that is the one the extractor's reader ends up
 * keeping when a key appears twice. `null` when the section holds none.
 */
export function findOrgPropertiesBlock(lines: string[], headingLine: number): OrgPropertiesRange | null {
    const blocks = findOrgPropertiesBlocks(lines, headingLine);
    return blocks.at(-1) ?? null;
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
 * The targeted edit needed to set the task's `org-properties` block: the
 * half-open line range `[startLine, endLineExclusive)` to replace and the
 * `blockLines` to put there. A replace returns the range of the existing
 * block; an insert returns an empty range (`startLine === endLineExclusive`)
 * at the insertion point. Lets the consumer build a minimal `WorkspaceEdit`
 * instead of rewriting the whole document (preserves EOL, smaller diffs).
 */
export interface OrgPropertiesEdit {
    startLine: number;
    endLineExclusive: number;
    blockLines: string[];
}

/**
 * Compute the targeted edit for setting the task's `org-properties` block to
 * `props` without mutating `lines`. If a block already exists (per
 * `findOrgPropertiesBlock`) its range is returned for in-place replacement;
 * otherwise the range is empty and points right after the heading's
 * planning-line run (the same insertion point `upsertOrgProperties` uses).
 */
export function computeOrgPropertiesEdit(
    lines: string[],
    headingLine: number,
    props: Record<string, string>
): OrgPropertiesEdit {
    const indent = deriveIndent(lines, headingLine);
    const blockLines = buildOrgPropertiesBlock(props, indent);
    const existing = findOrgPropertiesBlock(lines, headingLine);
    if (existing) {
        return { startLine: existing.startLine, endLineExclusive: existing.endLineExclusive, blockLines };
    }
    let insertAt = headingLine + 1;
    while (insertAt < lines.length && matchTimestampLine(lines[insertAt] ?? '')) {
        insertAt++;
    }
    return { startLine: insertAt, endLineExclusive: insertAt, blockLines };
}

/**
 * Return a new line array with the task's `org-properties` block set to
 * `props`. If a block already exists (per `findOrgPropertiesBlock`) it is
 * replaced in place; otherwise a fresh block is inserted right after the
 * heading's planning-line run. Pure: `lines` is not mutated. Designed to be
 * adapted to a `WorkspaceEdit` by the calendar-sync consumer.
 */
export function upsertOrgProperties(lines: string[], headingLine: number, props: Record<string, string>): string[] {
    const e = computeOrgPropertiesEdit(lines, headingLine, props);
    const result = [...lines];
    result.splice(e.startLine, e.endLineExclusive - e.startLine, ...e.blockLines);
    return result;
}
