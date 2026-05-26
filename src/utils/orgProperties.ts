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
