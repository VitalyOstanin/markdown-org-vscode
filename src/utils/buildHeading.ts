import type { TaskStatus } from '../types';

export interface HeadingParts {
    /** Leading `#` run that fixes the heading level. */
    hashes: string;
    /** Final TODO/DONE/CANCELLED keyword; omitted from the output when falsy. */
    status?: TaskStatus;
    /** Bare priority value (e.g. `A`, `5`); wrapped as `[#...]`, omitted when falsy. */
    priority?: string;
    /** Heading text after the keyword/priority tokens. */
    title: string;
}

/**
 * Reassemble a markdown/org heading line from its parts:
 * `<hashes> [status] [[#priority]] <title>`. Falsy `status`/`priority` are
 * dropped, which is how callers express a toggle-off (remove the keyword or
 * the priority). The single source of truth for token order and spacing, so
 * `setTaskStatus`, `togglePriority` and `adjustHeadingPart` cannot diverge.
 */
export function buildHeading(parts: HeadingParts): string {
    let result = `${parts.hashes} `;
    if (parts.status) {
        result += `${parts.status} `;
    }
    if (parts.priority) {
        result += `[#${parts.priority}] `;
    }
    result += parts.title;
    return result;
}
