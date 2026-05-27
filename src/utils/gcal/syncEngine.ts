import type { Task } from '../../types';
import type { FetchFn } from './oauth';
import type { AccessTokenProvider } from './accessToken';
import type { MapOptions } from './eventMapping';
import { isSyncable, mapTaskToEvent } from './eventMapping';
import { taskIdToEventId } from './eventId';
import { insertEvent, patchEvent, deleteEvent } from './calendarClient';
import type { RunHandle } from './mutex';

export type WriteOutcome = 'written' | 'deferred';

/**
 * Persists a task's `org-properties` block (merged) at file:line (1-based).
 * `expectedHeading` is the heading the extractor saw; the consumer verifies
 * the line still anchors that task. Returns `'deferred'` when the file has
 * unsaved edits or shifted since extraction — the engine then retries on a
 * later sync rather than corrupting the file.
 */
export interface PropertiesWriter {
    write(file: string, line: number, expectedHeading: string, props: Record<string, string>): Promise<WriteOutcome>;
}

export interface SyncDeps {
    tasks: Task[];
    fetchFn: FetchFn;
    getToken: AccessTokenProvider;
    calendarId: string;
    writer: PropertiesWriter;
    genUuid: () => string;
    mapOptions: (task: Task) => MapOptions;
    onDone: 'delete' | 'keep';
    signal?: RunHandle;
}

export interface SyncSummary {
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    /** Tasks whose property write-back was deferred (file dirty/shifted). */
    deferred: number;
    failed: number;
}

function linkedEventId(props: Record<string, string>): string | undefined {
    if (props.ID) {
        try {
            return taskIdToEventId(props.ID);
        } catch {
            return props.GCAL_EVENT_ID;
        }
    }
    return props.GCAL_EVENT_ID;
}

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
    const summary: SyncSummary = { created: 0, updated: 0, deleted: 0, skipped: 0, deferred: 0, failed: 0 };

    // Within a file, handle tasks bottom-up so writing one task's
    // org-properties block (which grows the file) never shifts the 1-based
    // line of a task we have not handled yet -- otherwise the writer's
    // heading-anchor check fails and the lower task is deferred for no reason.
    // We hold no live, auto-tracking marker on each task (unlike Emacs
    // org-gcal); bottom-up ordering is the equivalent for our snapshot model.
    // Order across files is irrelevant: edits and Google calls are independent.
    const ordered = [...deps.tasks].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : b.line - a.line));

    for (const task of ordered) {
        if (deps.signal?.aborted) {
            break;
        }
        const props: Record<string, string> = { ...(task.properties ?? {}) };
        const wantDelete = !isSyncable(task) || (task.task_type === 'DONE' && deps.onDone === 'delete');

        try {
            if (wantDelete) {
                const eid = linkedEventId(props);
                if (eid) {
                    await deleteEvent(deps.fetchFn, deps.getToken, deps.calendarId, eid);
                    summary.deleted++;
                } else {
                    summary.skipped++;
                }
                continue;
            }

            // Ensure a stable org-id ID (local-only write; no external effect).
            let orgId = props.ID;
            if (!orgId) {
                orgId = deps.genUuid();
                props.ID = orgId;
                const outcome = await deps.writer.write(task.file, task.line, task.heading, props);
                if (outcome === 'deferred') {
                    // Could not persist the new ID (file dirty/shifted). Skip the
                    // insert so we never create an event keyed by an ID we failed
                    // to store; retried on the next sync once the file is clean.
                    summary.deferred++;
                    continue;
                }
            }
            const eventId = taskIdToEventId(orgId);
            const event = mapTaskToEvent(task, orgId, deps.mapOptions(task));
            event.id = eventId;

            const res = await insertEvent(deps.fetchFn, deps.getToken, deps.calendarId, event);
            if (res.status === 'conflict') {
                await patchEvent(deps.fetchFn, deps.getToken, deps.calendarId, eventId, event);
                summary.updated++;
            } else {
                summary.created++;
            }

            if (props.GCAL_EVENT_ID !== eventId) {
                props.GCAL_EVENT_ID = eventId;
                // GCAL_EVENT_ID is only a cache (eventId is derived from ID), so a
                // deferred write here is harmless: the next sync re-derives it and
                // patches. Outcome intentionally ignored.
                await deps.writer.write(task.file, task.line, task.heading, props);
            }
        } catch {
            summary.failed++;
        }
    }

    return summary;
}
