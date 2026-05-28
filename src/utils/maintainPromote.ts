/**
 * Pure helpers for the **Promote to Maintain** command
 * (`markdown-org.promoteToMaintain`).
 *
 * The command picks up the markdown heading under the cursor (with its body
 * and child headings), normalises it to a `## ` root, and appends it under
 * the `# incoming` section of a configured *maintain* file. Typical use case
 * is migrating tasks from an older planner (org-mode, plain markdown,
 * spreadsheets imported as markdown) into a single up-to-date file: every
 * promoted heading lands in one predictable inbox-style section, ready to
 * be triaged.
 *
 * This module is vscode-free so the level-shift / insertion math can be
 * unit-tested in isolation; the editor binding (open, applyEdit, save)
 * lives in `src/commands/moveHeading.ts`.
 */

/** A heading block extracted from the source document. */
export interface PromoteBlock {
    /** Heading text without the leading `#` characters or the gap space. */
    headingText: string;
    /**
     * Heading level in the source (1 -- 6). Drives the `delta` used to
     * re-level child headings so that the promoted block lands under `## `
     * regardless of how deep it was originally.
     */
    headingLevel: number;
    /**
     * Lines of the block *after* the heading line itself: child headings,
     * planning lines, properties, paragraphs. Heading lines among them are
     * re-levelled by `delta = 2 - headingLevel`, clamped to `[1, 6]`. All
     * other lines are kept verbatim.
     */
    bodyLines: string[];
}

/** Regex for the `# incoming` section header, case-insensitive. */
const INCOMING_HEADING_RE = /^#\s+incoming$/i;

/**
 * Compute the new content of the maintain file after promoting `block`.
 *
 * Behaviour matches the existing `promoteToMaintain` command:
 *
 *   * The promoted heading is rewritten as `## <text>` regardless of its
 *     original level. Child headings shift by `delta = 2 - headingLevel`,
 *     clamped to `[1, 6]` (so e.g. an `### Subtask` under a level-3 heading
 *     stays at `###`, and a `# H1` under a level-3 heading drops to `##`).
 *   * If the maintain file already contains a `# incoming` heading
 *     (case-insensitive), the block is inserted directly after it followed
 *     by a blank-line separator.
 *   * If `# incoming` is absent, the block is appended to the end of the
 *     file under a freshly created `# incoming` heading. A `\n\n` separator
 *     is added between the previous content and the new section unless the
 *     content already ends with `\n\n` (or is empty).
 *
 * The function is pure: same inputs -> same string out, no I/O.
 */
export function computeMaintainInsertion(maintainContent: string, block: PromoteBlock): string {
    const lines = maintainContent.split('\n');
    let incomingIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (INCOMING_HEADING_RE.test(lines[i])) {
            incomingIndex = i;
            break;
        }
    }

    const delta = 2 - block.headingLevel;
    const newHeading = '## ' + block.headingText;
    const transformedBody = block.bodyLines.map((line) => {
        const m = line.match(/^(#+)\s+(.+)$/);
        if (m) {
            const newLevel = Math.min(6, Math.max(1, m[1].length + delta));
            return '#'.repeat(newLevel) + ' ' + m[2];
        }
        return line;
    });

    if (incomingIndex === -1) {
        // No `# incoming` yet: create one at the bottom. Keep the existing
        // trailing-newline shape intact -- a content that already ends with
        // a hard blank line ('\n\n') gets no extra separator, otherwise a
        // '\n\n' is injected so the new section visually stands apart.
        const sep = maintainContent && !maintainContent.endsWith('\n\n') ? '\n\n' : '';
        return maintainContent + sep + '# incoming\n' + newHeading + '\n' + transformedBody.join('\n') + '\n';
    }

    // `# incoming` exists: splice the block right after it and leave a
    // trailing empty line so the next promotion lands on its own paragraph.
    lines.splice(incomingIndex + 1, 0, newHeading, ...transformedBody, '');
    return lines.join('\n');
}
