/**
 * `H:MM` durations, as CLOCK lines and the clocktable write them.
 *
 * Lives apart from the `utils.ts` barrel, which imports `vscode`: the CLOCK
 * line editor is a pure function under the unit suite, and a barrel import
 * would drag the editor host into a run that has none.
 */

/** Format a duration in ms as `H:MM`; pad hours with a leading space for table alignment if requested. */
export function formatDurationHM(durationMs: number, opts?: { padHoursWithSpace?: boolean }): string {
    const totalMinutes = Math.floor(durationMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursStr = opts?.padHoursWithSpace ? hours.toString().padStart(2, ' ') : hours.toString();
    return `${hoursStr}:${minutes.toString().padStart(2, '0')}`;
}
