import { CLOCK_REGEX, HEADING_REGEX } from '../orgPatterns';
import { findClockLinesInLines } from './findClockLines';

export interface ClockTableRow {
    title: string;
    totalMinutes: number;
}

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
        const headingMatch = lines[i].match(HEADING_REGEX);
        if (!headingMatch?.groups) {
            continue;
        }

        const clockLineIndices = findClockLinesInLines(lines, i);
        let totalMinutes = 0;
        for (const idx of clockLineIndices) {
            const clockMatch = lines[idx].match(CLOCK_REGEX);
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
            totalMinutes += h * 60 + m;
        }

        if (totalMinutes > 0) {
            rows.push({ title: headingMatch.groups.title, totalMinutes });
        }
    }

    return rows;
}
