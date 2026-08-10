/**
 * Which directories the agenda sweeps.
 *
 * Three sources, in falling precedence:
 *   1. `markdown-org.workspaceDirs` -- a list, aggregated into one agenda. The
 *      extractor takes `--dir` more than once and reports which root each task
 *      came from (see `Task.root`), which is what the collection mark reads.
 *   2. `markdown-org.workspaceDir` -- the single-directory setting that came
 *      first. Kept working as it was: a user who set it sees no change.
 *   3. The first workspace folder.
 *
 * The list wins over the string rather than merging with it: a user who fills
 * the list has said where the notes are, and silently appending an old value
 * would scan a directory nothing names. Both settings are read as written --
 * no path resolution here, since the same value goes to the extractor and to
 * the file watcher, and a helper that resolved one of them would make the two
 * disagree.
 *
 * Empty entries are dropped and repeats collapse: an empty string is how VS
 * Code stores "not set", and the same directory twice would double every task
 * in the agenda.
 */
export function resolveAgendaDirectories(
    configuredDirs: readonly string[] | undefined,
    configuredDir: string | undefined,
    workspaceFolderPath: string | undefined
): string[] {
    const clean = (values: readonly (string | undefined)[]): string[] => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const value of values) {
            // The list comes from settings.json, where an entry can be anything
            // JSON allows; a non-string is dropped rather than stringified into
            // a `--dir` argument.
            if (typeof value !== 'string') {
                continue;
            }
            const trimmed = value.trim();
            if (trimmed === '' || seen.has(trimmed)) {
                continue;
            }
            seen.add(trimmed);
            out.push(trimmed);
        }
        return out;
    };

    const listed = clean(configuredDirs ?? []);
    if (listed.length > 0) {
        return listed;
    }
    return clean([configuredDir, workspaceFolderPath]).slice(0, 1);
}
