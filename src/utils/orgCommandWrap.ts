import { formatError } from './formatError';

// Top-level safety net for commands registered in extension.ts.
// Most user-facing commands have their own try/catch with a specific
// message (see agenda.ts loadData, clocktable.ts insertClockTable). This
// helper covers the remaining throws (e.g. filesystem errors in
// moveToArchive / promoteToMaintain, unexpected throws in clock or
// timestampEdit) so VS Code never surfaces the generic "Running the
// 'Markdown Org: ...' command resulted in an error" without diagnostics.

const COMMAND_PREFIX = 'markdown-org.';

export function buildCommandErrorMessage(commandName: string, err: unknown): string {
    const short = commandName.startsWith(COMMAND_PREFIX) ? commandName.slice(COMMAND_PREFIX.length) : commandName;
    return `${short} failed: ${formatError(err)}`;
}

export function withErrorReporting<A extends unknown[], R>(
    commandName: string,
    reportError: (message: string) => unknown,
    handler: (...args: A) => R | Promise<R>
): (...args: A) => Promise<R | undefined> {
    return async (...args: A) => {
        try {
            return await handler(...args);
        } catch (err) {
            reportError(buildCommandErrorMessage(commandName, err));
            return undefined;
        }
    };
}
