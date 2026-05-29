/**
 * Известные значения `task_type`, эмитируемые `markdown-org-extract` 0.8.0+.
 * Живёт здесь, рядом с полем `Task.task_type`, которое типизирует;
 * runtime-guard `normalizeTaskType` (src/utils/normalizeTaskType.ts) импортирует
 * этот тип, а не наоборот, чтобы зависимость шла utils -> types.
 */
export type TaskStatus = 'TODO' | 'DONE' | 'CANCELLED';

// snake_case field names mirror the JSON contract produced by
// `markdown-org-extract` (see ADR-0001). Renaming any field here breaks
// wire compatibility with the extractor binary -- bump the extractor in
// lockstep and document the change in CHANGELOG.md.
export interface Task {
    file: string;
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
    overdue: TaskWithOffset[];
    scheduled_timed: TaskWithOffset[];
    scheduled_no_time: TaskWithOffset[];
    upcoming: TaskWithOffset[];
}

export type AgendaData = DayAgenda[] | Task[];

export interface FileTag {
    name: string;
    pattern: string;
}
