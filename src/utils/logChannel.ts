import * as vscode from 'vscode';
import { timestampedLine } from './logLine';

/**
 * Diagnostic log for failures the user is not shown a message about.
 *
 * Some failures are handled by degrading rather than reporting: the agenda
 * renders without holidays when the extractor does not know `--holidays`, for
 * instance. That is the right behaviour for an old binary, but it makes a
 * broken one (timeout, unparsable output) look exactly the same. The reason
 * goes here so it can be read after the fact, without a toast on every refresh.
 *
 * The channel mirrors the one the calendar sync opens on demand
 * ("Markdown Org: Calendar Sync"); this one covers everything else.
 */
let channel: vscode.OutputChannel | undefined;

function getLogChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('Markdown Org');
    }
    return channel;
}

/** Append one timestamped line. Creates the channel on first use, never focuses it. */
export function logDiagnostic(message: string): void {
    if (testSink) {
        testSink(message);
        return;
    }
    getLogChannel().appendLine(timestampedLine(message));
}

// Test-only: the channel is created lazily and then cached for the session, so
// a test cannot reliably stub `createOutputChannel` before the first use.
// Installing a sink instead lets the integration suite assert what was logged.
let testSink: ((message: string) => void) | undefined;

/** Test-only hook: route diagnostics to `sink` (pass `undefined` to restore the channel). */
export function __setLogSinkForTesting(sink: ((message: string) => void) | undefined): void {
    testSink = sink;
}
