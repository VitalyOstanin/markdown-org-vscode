/**
 * Известные значения `task_type`, эмитируемые `markdown-org-extract` 0.9.0+.
 * Живёт здесь, рядом с полем `Task.task_type`, которое типизирует;
 * runtime-guard `normalizeTaskType` (src/utils/normalizeTaskType.ts) импортирует
 * этот тип, а не наоборот, чтобы зависимость шла utils -> types.
 *
 * Both cancelled spellings are accepted: `CANCELLED` (two L) and `CANCELED`
 * (one L, the org-mode manual spelling). markdown-org-extract 0.9.0+ preserves
 * the original spelling from the file in `task_type` (extract ADR-0021), so the
 * type carries both rather than collapsing them; use `isCancelled` to test
 * either form (src/utils/normalizeTaskType.ts).
 */
export type TaskStatus = 'TODO' | 'DONE' | 'CANCELLED' | 'CANCELED';

// snake_case field names mirror the JSON contract produced by
// `markdown-org-extract` (see ADR-0001). Renaming any field here breaks
// wire compatibility with the extractor binary -- bump the extractor in
// lockstep and document the change in CHANGELOG.md.
export interface Task {
    file: string;
    // Canonical path of the scan root this file was found under, emitted by
    // markdown-org-extract only when the run swept several directories
    // (`--dir` given more than once). Absent for a single-directory run, where
    // the root is what the caller passed in and the field would repeat it.
    // Optional and additive on the wire (extractor ADR-0015). The agenda uses
    // it for the collection mark on a row; nothing keys navigation off it,
    // since `--absolute-paths` makes `file` self-sufficient.
    root?: string;
    line: number;
    heading: string;
    content: string;
    // Narrowed to the known keyword set (TODO/DONE/CANCELLED). The extractor
    // may emit other strings in future versions; normalize unknown values to
    // `undefined` at the JSON parse boundary via `normalizeTaskType` so this
    // typed contract holds (see src/commands/agenda.ts).
    task_type?: TaskStatus;
    priority?: string;
    timestamp?: string;
    timestamp_date?: string;
    timestamp_time?: string;
    timestamp_type?: string;
    timestamp_active?: boolean;
    timestamp_end_time?: string;
    // Canonical org repeater string of the active timestamp (`++7d`,
    // `.+1m`, `+1wd`), emitted by markdown-org-extract as an additive
    // optional field (extractor ADR-0015). Absent when the timestamp has
    // no repeater or when produced by an older extractor. The gcal sync
    // maps it to a Google Calendar RRULE when the repeater has a single-rule
    // form; unrepresentable repeaters (e.g. `+2wd`) leave the event one-shot
    // (see utils/gcal/rrule.ts).
    timestamp_repeater?: string;
    // Resolved next still-upcoming occurrence date (`YYYY-MM-DD`) of a
    // repeating task, computed by markdown-org-extract relative to "now"
    // (extractor ADR-0023). Present only in the day/week/month agenda modes
    // and only for tasks with a repeater; absent in `tasks` mode, for
    // non-repeating tasks, and from an older extractor. The agenda repeat
    // tooltip prefers it so "next" never names a past occurrence.
    timestamp_next?: string;
    // Per-task key/value pairs parsed by markdown-org-extract from an
    // `org-properties` fenced code block. Absent when the task has no such
    // block. Optional and additive on the wire (extractor ADR-0015), so an
    // older extractor that does not emit it simply leaves this undefined.
    properties?: Record<string, string>;
}

export interface TaskWithOffset extends Task {
    days_offset?: number;
}

// Same wire-contract caveat as `Task`: bucket names (`scheduled_timed`,
// `scheduled_no_time`) come from `markdown-org-extract` JSON output and
// must stay in snake_case. Week/month agenda payloads may omit empty
// buckets, so callers default each one to `[]` (see `src/utils/tagFilter.ts`).
export interface DayAgenda {
    date: string;
    // Optional on the wire: markdown-org-extract omits a bucket that is empty
    // in week and month mode. Declaring them required was how v0.3.0 shipped
    // "Cannot read properties of undefined (reading 'filter')" -- the type said
    // the key was there and every reader believed it.
    overdue?: TaskWithOffset[];
    scheduled_timed?: TaskWithOffset[];
    scheduled_no_time?: TaskWithOffset[];
    upcoming?: TaskWithOffset[];
}

export type AgendaData = DayAgenda[] | Task[];

/**
 * One entry of a tag declaration, as the settings and a tags file spell it.
 *
 * Either spelling, or both at once: `pattern` is the single string the setting
 * has always taken (a leading `!` making it "everything else"), `include` and
 * `exclude` are the lists a tags file can use to say what a tag takes and what
 * it refuses in one entry. What they mean once merged is in `tagDictionary`.
 */
export interface FileTag {
    name: string;
    pattern?: string;
    include?: string[];
    exclude?: string[];
}

/**
 * Git status of the agenda's source files, as it crosses from the extension
 * host into the page.
 *
 * Lives here for the same reason `Task` does: it is a payload contract between
 * the two sides, and the webview is a separate TypeScript project that may not
 * import host-only modules (they reach for `node:path`, which does not exist in
 * a page). The model that produces these values is
 * `src/utils/git/gitStatusModel.ts`.
 */
export interface GitFileState {
    /** Path exactly as the extractor reported it; the page opens this one. */
    file: string;
    /** Path after `realpath`, present only when it differs from `file`. */
    realPath?: string;
    /** Path relative to the repository root, or the bare name outside git. */
    label: string;
    /** Root of the repository holding it; absent when it is outside git. */
    repoRoot?: string;
    uncommitted: boolean;
    unpushed: boolean;
    /**
     * Left unresolved by a merge in progress. Kept apart from `uncommitted`
     * because the two ask for opposite actions: one is committed from here,
     * the other has to be resolved first and this extension will not commit
     * while it stands.
     */
    conflicted: boolean;
}

/** One unpushed commit, reduced to what the panel prints. */
export interface GitCommitState {
    /** Abbreviated hash, already shortened for display. */
    hash: string;
    /** First line of the message. */
    subject: string;
}

export interface GitRepoState {
    root: string;
    /** Directory name of the root, used as the label when several are shown. */
    name: string;
    branch?: string;
    /** `origin/master`; absent when the branch has no upstream. */
    upstream?: string;
    aheadCommits?: number;
    /**
     * The commits Push would send, newest first, capped by the collector. The
     * count in `aheadCommits` is the whole truth, so a shorter list here means
     * the rest are summarised as "and N more" rather than silently dropped.
     */
    unpushedCommitList?: GitCommitState[];
    /**
     * Paths the repository reports as conflicted, whether or not the agenda
     * reads them: the refusal to commit is about the repository's state, so
     * the number that explains it has to be the repository's own.
     */
    conflictCount?: number;
}

export interface AgendaGitStatus {
    repos: GitRepoState[];
    files: GitFileState[];
    /** Source files with uncommitted changes. */
    uncommittedCount: number;
    /** Source files touched by unpushed commits. */
    unpushedCount: number;
    /** Source files that belong to no repository. */
    outsideGitCount: number;
    /** Commits ahead of upstream, summed over the repositories in the view. */
    unpushedCommits: number;
    /**
     * Unresolved paths, summed over the same repositories. Non-zero disables
     * the commit button: what stands in the way is the merge, not the files
     * the view happens to show.
     */
    conflictCount: number;
}

/**
 * What the page reports about the view it has just rendered.
 *
 * Declared here because both projects need it: the page builds it
 * (`postRenderedInfo` in the webview client) and the host reads it
 * (`AgendaPanel.queryRenderedInfoForTesting`). It used to be written out by
 * hand in both places plus a third time as the handler's parameter type, so a
 * field added to the page reached the host as `undefined` with nothing to say
 * so.
 *
 * Test-facing rather than production data: nothing in the shipped flow reads
 * it, and it exists because a webview cannot be inspected from a test any other
 * way.
 */
export interface AgendaRenderedInfo {
    dayHeaders: string[];
    mode: string;
    flags: string[];
    /** Section-panel titles, in document order. */
    sections: string[];
    /** Section keys that offer a group action, in document order. */
    sectionMenus: string[];
    /** Every foldable head as its key, plus ` (folded)` while it is folded. */
    sectionFolds: string[];
    /** How many task rows the page is showing; a folded section renders none. */
    taskRows: number;
    /** Tooltip of each collection dot, in row order; empty with one directory. */
    collectionMarks: string[];
    /** Directory chips, each as its name plus ` (off)` while it is hidden. */
    collectionChips: string[];
    headerLayout: string;
    heroSharesControlRow: boolean;
    heroSub: string;
    dayNumbers: string[];
    /** Text of the git chip, or empty when the header carries none. */
    gitChip: string;
    /** Dropdown actions, each as `commit` / `push` plus ` (off, busy)`. */
    gitActions: string[];
    /** `data-group` of each dropdown group, in document order. */
    gitGroups: string[];
    /** Rows hidden above/below per day header, aligned with `dayHeaders`. */
    clipAbove: number[];
    clipBelow: number[];
    /** Whether today's first task row sits behind its own sticky header. */
    todayFirstRowHidden: boolean;
    /** Where the page ended up after the render decided its scroll. */
    scrollY: number;
    /**
     * Tag name of what holds the keyboard focus inside the page, `''` when
     * nothing does. The find widget only answers Ctrl+F once the focus is in
     * the document, so this is what tells "the panel is open" from "the panel
     * takes keys".
     */
    focusedTag: string;
}
