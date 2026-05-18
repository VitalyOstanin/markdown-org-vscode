// Decide which directory the agenda's FileSystemWatcher should be rooted in.
// Mirrors the precedence used by commands/agenda.ts loadData() so the watcher
// observes exactly the directory that the extractor sweeps:
//   markdown-org.workspaceDir (if set and non-empty) > first workspace folder.
// Returning undefined signals "no usable base"; in practice the agenda
// command bails earlier in that case, but the helper still has a defined
// contract for unit testing.
export function resolveAgendaWatchBase(
    configuredDir: string | undefined,
    workspaceFolderPath: string | undefined
): string | undefined {
    if (configuredDir) {
        return configuredDir;
    }
    return workspaceFolderPath;
}
