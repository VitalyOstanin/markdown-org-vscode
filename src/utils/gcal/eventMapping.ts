// Pure mapping from an org task to a Google Calendar event resource (no VS Code, no I/O).
import type { Task } from '../../types';
import type { GcalEventResource } from './types';

export interface MapOptions {
    timeZone: string; // IANA
    defaultEventMinutes: number;
    relPath: string; // for the description footer
}

const SYNCABLE_TYPES = new Set(['SCHEDULED', 'DEADLINE']);

/** A task is pushed only when it has an active SCHEDULED/DEADLINE date. */
export function isSyncable(task: Task): boolean {
    return (
        task.timestamp_active === true &&
        typeof task.timestamp_type === 'string' &&
        SYNCABLE_TYPES.has(task.timestamp_type) &&
        typeof task.timestamp_date === 'string' &&
        task.timestamp_date.length > 0
    );
}

/** Add `n` whole days to an ISO `YYYY-MM-DD` date (pure, UTC-based). */
export function addDaysToIsoDate(iso: string, n: number): string {
    const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
}

/** Add minutes to a wall-clock `date`/`HH:MM`, rolling the date if needed. */
export function addMinutesToWallClock(date: string, time: string, minutes: number): { date: string; time: string } {
    const [h, m] = time.split(':').map((s) => parseInt(s, 10));
    const total = h * 60 + m + minutes;
    const dayShift = Math.floor(total / 1440);
    const within = ((total % 1440) + 1440) % 1440;
    const nh = Math.floor(within / 60);
    const nm = within % 60;
    const pad = (x: number) => x.toString().padStart(2, '0');
    return { date: addDaysToIsoDate(date, dayShift), time: `${pad(nh)}:${pad(nm)}` };
}

function buildDescription(content: string | undefined, relPath: string, line: number): string {
    const footer = `Source: ${relPath}:${line}`;
    const body = (content ?? '').trim();
    return body ? `${body}\n\n${footer}` : footer;
}

/** Map a syncable task to a Google Calendar event resource. */
export function mapTaskToEvent(task: Task, orgId: string, opts: MapOptions): GcalEventResource {
    const date = task.timestamp_date as string;
    const ext = {
        private: {
            mdOrgId: orgId,
            mdOrgTsType: task.timestamp_type as string
        }
    };

    let start: GcalEventResource['start'];
    let end: GcalEventResource['end'];

    if (task.timestamp_time) {
        const startTime = task.timestamp_time;
        let endDate = date;
        let endTime = task.timestamp_end_time;
        const startTotal = toMinutes(startTime);
        if (!endTime || toMinutes(endTime) <= startTotal) {
            const e = addMinutesToWallClock(date, startTime, opts.defaultEventMinutes);
            endDate = e.date;
            endTime = e.time;
        }
        start = { dateTime: `${date}T${startTime}:00`, timeZone: opts.timeZone };
        end = { dateTime: `${endDate}T${endTime}:00`, timeZone: opts.timeZone };
    } else {
        start = { date };
        end = { date: addDaysToIsoDate(date, 1) };
    }

    return {
        id: undefined, // assigned by the caller from eventId(orgId)
        // Explicit 'confirmed' revives a previously soft-deleted (cancelled)
        // event when the task goes DONE -> TODO again: the deterministic id is
        // still held by the cancelled event, so insert 409s and we patch; the
        // patch must carry status to flip it back from cancelled to confirmed.
        status: 'confirmed',
        summary: task.heading,
        description: buildDescription(task.content, opts.relPath, task.line),
        start,
        end,
        extendedProperties: ext
    };
}

function toMinutes(time: string): number {
    const [h, m] = time.split(':').map((s) => parseInt(s, 10));
    return h * 60 + m;
}
