/**
 * Build the HTML for the `timeInfo` cell of an agenda task-line.
 *
 * The cell is the second grid column of `.task-line` (140px fixed-width),
 * placed before status / priority / heading. Two pieces of information may
 * end up here:
 *
 *   1. The clock time of a SCHEDULED event with explicit `HH:MM` --
 *      rendered as `time......` so the dot-trail visually separates it from
 *      the heading column to the right.
 *   2. The timestamp type when it is something attention-grabbing other
 *      than SCHEDULED/PLAIN -- e.g. DEADLINE. Rendered in its own block,
 *      so it always lands on the line below the time (or, with no time,
 *      occupies the cell alone). This stable two-line layout is why no
 *      "look at the row above" caret is needed -- the visual stack of
 *      `time` over `DEADLINE` is unambiguous in any font/size.
 *
 * When neither field applies, `daysOffset` is used to produce a short
 * relative label ("In 3 d.:", "2 d. ago:", "Sched.5x:") so the user can see
 * how far the task sits from today within Day / Week views.
 *
 * The function is inlined into the agenda webview via `Function.prototype.toString()`
 * (see agendaPanel.ts `getHtmlContent`), so the unit tests here transitively
 * cover the runtime rendering without spinning up an extension host.
 */
export interface AgendaTaskTimeInput {
    readonly timestamp_time?: string | null;
    readonly timestamp_type?: string | null;
}

export function buildTimeInfo(
    task: AgendaTaskTimeInput,
    daysOffset: number | undefined,
    escapeHtml: (text: string) => string
): string {
    if (task.timestamp_time) {
        const type = task.timestamp_type;
        if (type && type !== 'PLAIN' && type !== 'SCHEDULED') {
            const typeClass = type === 'DEADLINE' ? 'timestamp-deadline' : 'timestamp-type';
            return (
                '<span class="time-display">' +
                escapeHtml(task.timestamp_time) +
                '......</span>' +
                '<span class="' +
                typeClass +
                '">' +
                escapeHtml(type) +
                '</span>'
            );
        }
        return '<span class="time-display">' + escapeHtml(task.timestamp_time) + '......</span>';
    }
    if (daysOffset !== undefined) {
        if (daysOffset < 0) {
            const daysAgo = Math.abs(daysOffset);
            if (task.timestamp_type === 'SCHEDULED') {
                return 'Sched.' + daysAgo + 'x:';
            }
            return daysAgo + ' d. ago:';
        }
        if (daysOffset > 0) {
            return 'In ' + daysOffset + ' d.:';
        }
    }
    const type = task.timestamp_type;
    if (type && type !== 'PLAIN' && type !== 'SCHEDULED') {
        const typeClass = type === 'DEADLINE' ? 'timestamp-deadline' : 'timestamp-type';
        return '<span class="' + typeClass + '">' + escapeHtml(type) + '</span>';
    }
    return '';
}
