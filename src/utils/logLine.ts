/**
 * The line format both output channels use: a local-time prefix in brackets,
 * then the message verbatim.
 *
 * Kept in its own vscode-free module so the diagnostic channel
 * (`logChannel.ts`) and the calendar-sync channel (`gcalSync.ts`) share one
 * definition instead of repeating the template literal at every call site --
 * the sync channel had four copies of it, which is how two of them ended up
 * with the message glued on differently.
 *
 * `now` is a parameter so the format can be asserted without a clock stub.
 */
export function timestampedLine(message: string, now: Date = new Date()): string {
    return `[${now.toLocaleTimeString()}] ${message}`;
}
