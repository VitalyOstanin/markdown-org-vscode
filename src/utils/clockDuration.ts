// Parse a CLOCK total duration string ("H:MM") into total minutes.
// Defends against malformed input from upstream tooling: returns 0
// instead of NaN so a single broken row can't poison `totalMinutes`
// and render "NaN:NaN" in the clock table.
export function parseClockDuration(duration: string): number {
    const parts = duration.split(':');
    const [rawHours, rawMins] = parts;
    if (parts.length !== 2 || rawHours === undefined || rawMins === undefined) {
        return 0;
    }
    const hours = parseInt(rawHours, 10);
    const mins = parseInt(rawMins, 10);
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) {
        return 0;
    }
    return hours * 60 + mins;
}
