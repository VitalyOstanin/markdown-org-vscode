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
