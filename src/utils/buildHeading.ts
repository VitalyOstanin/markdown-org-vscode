import type { TaskStatus } from '../types';

export interface HeadingParts {
    /** Leading `#` run that fixes the heading level. */
    hashes: string;
    /** Final TODO/DONE/CANCELLED/CANCELED keyword; omitted from the output when falsy. */
    status?: TaskStatus | undefined;
    /** Bare priority value (e.g. `A`, `5`); wrapped as `[#...]`, omitted when falsy. */
    priority?: string | undefined;
    /** Heading text after the keyword/priority tokens. */
    title: string;
}

/**
 * Reassemble a markdown/org heading line from its parts:
 * `<hashes> [status] [[#priority]] <title>`. Falsy `status`/`priority` are
 * dropped, which is how callers express a toggle-off (remove the keyword or
 * the priority). The single source of truth for token order and spacing, so
 * `setTaskStatus`, `togglePriority` and `adjustHeadingPart` cannot diverge.
 *
 * The tokens are joined rather than each given a trailing space, so a heading
 * with nothing after them does not end in one: clearing the priority of
 * `## TODO [#A]` used to write `## TODO ` and leave the file with trailing
 * whitespace no editor setting would strip on a line the user never typed on.
 */
export function buildHeading(parts: HeadingParts): string {
    const tokens = [parts.hashes];
    if (parts.status) {
        tokens.push(parts.status);
    }
    if (parts.priority) {
        tokens.push(`[#${parts.priority}]`);
    }
    if (parts.title !== '') {
        tokens.push(parts.title);
    }
    // A heading with nothing after the hashes keeps the space that makes it
    // one: `#` alone is not a heading to this extension nor to the extractor
    // (`HEADING_HASHES_RE` asks for a space or a tab), so clearing the last
    // token off `## [#A]` without it would leave a line no command could
    // touch again and no agenda would list. This is the one case the trailing
    // space is load-bearing rather than left over.
    if (tokens.length === 1) {
        return `${parts.hashes} `;
    }
    return tokens.join(' ');
}
