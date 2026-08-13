/**
 * `H:MM` durations, as CLOCK lines and the clocktable write them.
 *
 * Lives apart from the `utils.ts` barrel, which imports `vscode`: the CLOCK
 * line editor is a pure function under the unit suite, and a barrel import
 * would drag the editor host into a run that has none.
 */

/**
 * Format a duration in ms as `H:MM`; pad hours with a leading space for table alignment if requested.
 *
 * A negative duration carries one sign, on the hours (`-2:30`). Shifting the
 * end of a CLOCK entry past its start produces one, and signing both halves --
 * which is what plain division and remainder do -- would write `-2:-30`, a form
 * that is neither a duration nor a time.
 */
export function formatDurationHM(durationMs: number, opts?: { padHoursWithSpace?: boolean }): string {
    const totalMinutes = Math.floor(Math.abs(durationMs) / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const signedHours = `${durationMs < 0 ? '-' : ''}${hours}`;
    const hoursStr = opts?.padHoursWithSpace ? signedHours.padStart(2, ' ') : signedHours;
    return `${hoursStr}:${minutes.toString().padStart(2, '0')}`;
}
