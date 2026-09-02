/**
 * Version handling for the external `markdown-org-extract` binary.
 *
 * The extension bundles a pinned build, but `markdown-org.extractorPath` can
 * point at any binary on the machine. An older one mostly answers the calls the
 * agenda makes -- it simply omits fields added later (`timestamp_repeater` in
 * 0.10.0, `timestamp_next` in 0.11.0, the exception keys of a repeating series
 * in 0.18.0, those keys in the forms a calendar export writes them in 0.19.0),
 * and the panel then renders as if the task had no repeater, no next
 * occurrence and no occurrence cancelled or moved. Nothing distinguishes that
 * from a task that genuinely has neither, which is why the version is checked
 * and reported rather than inferred from missing data. One call is not
 * optional: the month view asks for `--agenda month-grid` (0.17.0), which an
 * older binary rejects outright, and writing a task from a phrase asks for
 * `parse-phrase` (0.20.0), which one older has no subcommand for at all.
 * Changing an entry by phrase reads two keys that subcommand only prints from
 * 0.21.0 (`keyword` and `cleared`), and a binary between the two answers such
 * a phrase with a field the entry does not change.
 *
 * Pure and vscode-free so it can be unit-tested; the wiring lives in
 * `extractor.ts`.
 */

import { group } from './regexGroups';

/** `markdown-org-extract 0.11.0` -> `0.11.0`. Undefined when unrecognised. */
export function parseExtractorVersion(stdout: string): string | undefined {
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(stdout);
    return m ? `${group(m, 1)}.${group(m, 2)}.${group(m, 3)}` : undefined;
}

/**
 * Compare two `MAJOR.MINOR.PATCH` strings. Returns a negative number when `a`
 * precedes `b`, zero when equal, positive otherwise. Pre-release suffixes are
 * not part of the extractor's versioning scheme and are ignored.
 */
export function compareVersions(a: string, b: string): number {
    const parts = (v: string): [number, number, number] => {
        const m = /(\d+)\.(\d+)\.(\d+)/.exec(v);
        return m ? [Number(group(m, 1)), Number(group(m, 2)), Number(group(m, 3))] : [0, 0, 0];
    };
    const [aMajor, aMinor, aPatch] = parts(a);
    const [bMajor, bMinor, bPatch] = parts(b);
    return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch;
}

/**
 * The warning shown for a binary older than the pinned version, or undefined
 * when there is nothing to say (unparseable output, or a version at or above
 * the pin -- a newer binary is expected to stay compatible).
 */
export function extractorVersionWarning(actual: string | undefined, required: string): string | undefined {
    if (!actual || compareVersions(actual, required) >= 0) {
        return undefined;
    }
    return (
        `markdown-org.extractorPath points at markdown-org-extract ${actual}, ` +
        `older than the ${required} this version expects. The month view asks for a ` +
        'grid older binaries do not offer (--agenda month-grid, added in 0.17.0) and ' +
        'fails to open; repeat tooltips and the next-occurrence date may be missing ' +
        'or wrong. An occurrence cancelled or moved elsewhere (0.18.0) is not reported ' +
        'at all, so the agenda still shows it and a Google Calendar export sends the ' +
        'series over the entry standing in for it, and the forms a calendar export ' +
        'writes those keys in -- an EXDATE carrying a time, a RECURRENCE_ID written ' +
        'with seconds -- are read only from 0.19.0. Insert Task from Phrase asks for a ' +
        'subcommand that does not exist before 0.20.0 (parse-phrase) and reports its ' +
        'refusal every time; Edit Task from Phrase reads the keyword and the emptied ' +
        'fields that subcommand prints from 0.21.0, and an older one leaves both out, ' +
        'so a phrase that empties a field changes nothing. Clear the setting to use ' +
        'the bundled binary.'
    );
}
