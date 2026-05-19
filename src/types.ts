// snake_case field names mirror the JSON contract produced by
// `markdown-org-extract` (see ADR-0001). Renaming any field here breaks
// wire compatibility with the extractor binary -- bump the extractor in
// lockstep and document the change in CHANGELOG.md.
export interface Task {
    file: string;
    line: number;
    heading: string;
    content: string;
    task_type?: string;
    priority?: string;
    timestamp?: string;
    timestamp_date?: string;
    timestamp_time?: string;
    timestamp_type?: string;
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
