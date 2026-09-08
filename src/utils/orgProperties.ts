// Pure, vscode-free helpers for the on-disk `org-properties` block
// (markdown-org-vscode ADR-0009). The block is a fenced code block with
// the info string `org-properties` holding bare `KEY: value` lines, placed
// under a heading and its planning (SCHEDULED/DEADLINE/CREATED/CLOSED)
// lines. These functions operate on arrays of document lines so they can be
// unit-tested without the editor; the editor binding (WorkspaceEdit) lives
// with the consumer (calendar sync), not here.
import { isSectionBreak, matchTimestampLine } from '../orgPatterns';

/** Info string that marks a property block. Exact match, no extra attrs. */
const ORG_PROPERTIES_INFO = 'org-properties';

/** The opening fence a block is written with when the entry gains one. */
const ORG_PROPERTIES_FENCE = `\`\`\`${ORG_PROPERTIES_INFO}`;

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
const FENCE_REGEX = /^(\s*)(`{3,}|~{3,})\s*(.*)$/;
// Where the section ends is `isSectionBreak` in `orgPatterns`, shared with
// everything else that asks the question.

/** Half-open line range `[startLine, endLineExclusive)` of a found block. */
export interface OrgPropertiesRange {
    startLine: number;
    endLineExclusive: number;
}

/** The opening fence of a block, or null when the line is not one. */
function openingFence(line: string): { marker: string; info: string } | null {
    const m = FENCE_REGEX.exec(line);
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
    const m = FENCE_REGEX.exec(line);
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
export function findOrgPropertiesBlocks(lines: readonly string[], headingLine: number): OrgPropertiesRange[] {
    const found: OrgPropertiesRange[] = [];
    let i = headingLine + 1;
    while (i < lines.length) {
        const line = lines[i] ?? '';
        const opening = openingFence(line);
        if (!opening) {
            if (isSectionBreak(line)) {
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
export function findOrgPropertiesBlock(lines: readonly string[], headingLine: number): OrgPropertiesRange | null {
    const blocks = findOrgPropertiesBlocks(lines, headingLine);
    return blocks.at(-1) ?? null;
}

/**
 * Indent to use for the block: taken from the first planning line after the
 * heading (so the block aligns with SCHEDULED/DEADLINE/...), or '' if there
 * are no planning lines.
 */
function deriveIndent(lines: readonly string[], headingLine: number): string {
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
    lines: readonly string[],
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
export function upsertOrgProperties(
    lines: readonly string[],
    headingLine: number,
    props: Record<string, string>
): string[] {
    const e = computeOrgPropertiesEdit(lines, headingLine, props);
    const result = [...lines];
    result.splice(e.startLine, e.endLineExclusive - e.startLine, ...e.blockLines);
    return result;
}

/** The key and the value a property line holds (ADR-0020: split on the first colon). */
function propertyLine(line: string): [string, string] | null {
    const at = line.indexOf(':');
    if (at < 0) {
        return null;
    }
    const key = line.slice(0, at).trim();
    if (key === '') {
        return null;
    }
    return [key, line.slice(at + 1).trim()];
}

/** The whitespace a line begins with. */
export function indentation(line: string): string {
    return line.slice(0, line.length - line.trimStart().length);
}

/**
 * Which line of the section holds `key`, and what it says.
 *
 * The last one wins, as the extractor merges the blocks of a section: a key
 * written twice reads as what the second one says, and an edit that rewrote
 * the first would leave the entry saying what it said before.
 */
export function findOrgProperty(
    lines: readonly string[],
    headingLine: number,
    key: string
): { line: number; value: string } | null {
    let found: { line: number; value: string } | null = null;
    for (const block of findOrgPropertiesBlocks(lines, headingLine)) {
        for (let i = block.startLine + 1; i < block.endLineExclusive - 1; i++) {
            const hit = propertyLine(lines[i] ?? '');
            if (hit?.[0] === key) {
                found = { line: i, value: hit[1] };
            }
        }
    }
    return found;
}

/**
 * Write `key` into the property block of the entry at `headingLine`.
 *
 * The line the key is already on is rewritten where there is one; otherwise it
 * joins the last property block the entry has, and an entry with no block gets
 * one under its planning lines -- which is where the extractor's ADR-0020 puts
 * it. Pure: `lines` is not mutated.
 */
export function setOrgProperty(lines: readonly string[], headingLine: number, key: string, value: string): string[] {
    const result = [...lines];
    const written = findOrgProperty(result, headingLine, key);
    if (written) {
        result[written.line] = `${indentation(result[written.line] ?? '')}${key}: ${value}`;
        return result;
    }

    const blocks = findOrgPropertiesBlocks(result, headingLine);
    const last = blocks.at(-1);
    if (last) {
        // Written the way the block's other lines are; a block holding none yet
        // is followed by its closing fence, which carries the block's indent.
        const closing = last.endLineExclusive - 1;
        const sample = Math.min(last.startLine + 1, closing);
        result.splice(closing, 0, `${indentation(result[sample] ?? '')}${key}: ${value}`);
        return result;
    }

    let at = headingLine + 1;
    while (at < result.length && matchTimestampLine(result[at] ?? '')) {
        at++;
    }
    result.splice(at, 0, ORG_PROPERTIES_FENCE, `${key}: ${value}`, '```');
    return result;
}

/**
 * Take `key` out of the entry at `headingLine`.
 *
 * The block goes with the last key it held: a fence around nothing is a line
 * of noise in a file people read, and the extractor reads an entry without a
 * block the same way it reads one whose block says nothing.
 */
export function removeOrgProperty(
    lines: readonly string[],
    headingLine: number,
    key: string
): { lines: string[]; changed: boolean } {
    const written = findOrgProperty(lines, headingLine, key);
    if (!written) {
        return { lines: [...lines], changed: false };
    }
    const block = findOrgPropertiesBlocks(lines, headingLine).find(
        (range) => written.line > range.startLine && written.line < range.endLineExclusive - 1
    );
    const result = [...lines];
    if (block && block.endLineExclusive - block.startLine === 3) {
        result.splice(block.startLine, 3);
        return { lines: result, changed: true };
    }
    result.splice(written.line, 1);
    return { lines: result, changed: true };
}
