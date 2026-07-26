import { CLOCK_REGEX, HEADING_REGEX } from '../orgPatterns';
import { findClockLinesInLines } from './findClockLines';
import { namedGroups } from './regexGroups';

export interface ClockTableRow {
    title: string;
    totalMinutes: number;
}

/**
 * Upper bound on a single entry's duration, matching `MAX_DURATION_HOURS` in
 * markdown-org-extract's `clock.rs`. Both projects read the same CLOCK lines
 * off disk, so they have to accept the same ones: otherwise the extractor's
 * `total_clock_time` and the table this module builds disagree on the same
 * file. A duration past this bound is a typo, not a work session.
 */
const MAX_DURATION_HOURS = 10_000;

/**
 * Walk the document and collect a CLOCK summary per heading, independent of
 * the heading's TODO/DONE status. This mirrors Org-mode's clocktable
 * semantics with `:scope file`: every heading that has at least one closed
 * CLOCK entry contributes its summed duration. Plain headings (no
 * TODO/DONE keyword) are included on the same terms.
 *
 * The earlier extractor-based path silently dropped DONE and plain
 * headings because `markdown-org-extract --tasks` filters by task_type.
 *
 * Open CLOCK entries (no `=> H:MM` tail) are ignored to keep the report
 * deterministic; Org-mode would credit the running clock against `now`,
 * but the inserted markdown table would go stale immediately.
 */
export function parseClockEntries(text: string): ClockTableRow[] {
    const lines = text.split(/\r?\n/);
    const rows: ClockTableRow[] = [];

    for (let i = 0; i < lines.length; i++) {
        const headingMatch = (lines[i] ?? '').match(HEADING_REGEX);
        if (!headingMatch?.groups) {
            continue;
        }

        const clockLineIndices = findClockLinesInLines(lines, i);
        let totalMinutes = 0;
        for (const idx of clockLineIndices) {
            const clockMatch = (lines[idx] ?? '').match(CLOCK_REGEX);
            if (!clockMatch?.groups) {
                continue;
            }
            const hours = clockMatch.groups.durationHours;
            const minutes = clockMatch.groups.durationMinutes;
            if (hours === undefined || minutes === undefined) {
                continue;
            }
            const h = parseInt(hours, 10);
            const m = parseInt(minutes, 10);
            if (!Number.isFinite(h) || !Number.isFinite(m)) {
                continue;
            }
            // Same acceptance rules as the extractor: a negative duration
            // (`=> -2:00`), a minutes field that is not a minutes field
            // (`=> 1:75`) and anything past the sanity bound are dropped
            // rather than summed.
            if (h < 0 || m < 0 || m >= 60 || h > MAX_DURATION_HOURS) {
                continue;
            }
            totalMinutes += h * 60 + m;
        }

        if (totalMinutes > 0) {
            rows.push({ title: namedGroups(headingMatch, 'title').title, totalMinutes });
        }
    }

    return rows;
}
