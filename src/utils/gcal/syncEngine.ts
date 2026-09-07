import type { Task, MovedOccurrence } from '../../types';
import { isCancelled } from '../normalizeTaskType';
import { isIsoDate } from '../isoDate';
import { formatError } from '../formatError';
import type { FetchFn } from './oauth';
import type { AccessTokenProvider } from './accessToken';
import type { MapOptions } from './eventMapping';
import { isSyncable, mapMovedOccurrenceToEvent, mapTaskToEvent } from './eventMapping';
import { collectReplacedOccurrences, occurrencesMissingFrom } from './seriesExceptions';
import { movedEventId, taskIdToEventId } from './eventId';
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
    /**
     * Wall-clock time (ms since epoch) after which the run stops and returns
     * what it has. Each call can spend up to ~24s in retries and the tasks are
     * walked one by one, so a rate-limited run would otherwise hold the lock
     * for an unbounded stretch. Absent means "no budget".
     */
    deadlineAt?: number;
    /** Clock, overridable in tests. */
    now?: () => number;
}

/** Actions worth listing per task. `skipped` is intentionally absent: those
 *  tasks had nothing to do (no active date, no linked event) and are usually
 *  many, so they stay a count only -- not a per-item log line. */
export type SyncAction = 'created' | 'updated' | 'deleted' | 'deferred' | 'failed';

/** One affected task, for the summary toast / details channel. */
export interface SyncChange {
    action: SyncAction;
    /** The task's date (`YYYY-MM-DD`) if it has one, else undefined. */
    date?: string | undefined;
    heading: string;
    /** Failure reason (only set for `action: 'failed'`), for the details channel. */
    error?: string | undefined;
}

export interface SyncSummary {
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    /** Tasks whose property write-back was deferred (file dirty/shifted). */
    deferred: number;
    failed: number;
    /** Per-task log of everything except `skipped`, in processing order. */
    changes: SyncChange[];
    /**
     * Set when the run gave up before walking every task, holding the failure
     * that ended it. Unset on a run that went through to the end (whether or
     * not individual tasks failed).
     */
    stoppedEarly?: string;
}

/**
 * How many failures in a row end the run.
 *
 * A failure that repeats for every task is not about the tasks: revoked access,
 * a deleted calendar, a rate limit, a network that is down. Since every call
 * retries with backoff, continuing costs up to four requests per remaining task
 * against an API that has already refused -- minutes of traffic for a run that
 * cannot succeed. Three in a row is past the point where per-task breakage
 * (a heading that moved, one malformed event) explains it.
 */
const CONSECUTIVE_FAILURES_BEFORE_STOP = 3;

/**
 * The days this entry has moved-occurrence events out in the calendar for.
 *
 * A move is a line of the series, so nothing in the calendar points back at
 * it: once the line is taken out of the notes, no later run has any way to
 * know an event was ever written for that day, and it would stand in the
 * calendar for good. The days go beside `GCAL_EVENT_ID`, which is a cache of
 * the same kind, and a run deletes what the notes no longer name.
 */
const MOVED_DAYS_PROPERTY = 'GCAL_MOVED';

/** The days remembered in `GCAL_MOVED`, as written by an earlier run. */
function movedDaysRemembered(props: Record<string, string>): string[] {
    return (props[MOVED_DAYS_PROPERTY] ?? '').split(/\s+/).filter((day) => isIsoDate(day));
}

/** Write the days back, or take the property out where none are left. */
function rememberMovedDays(props: Record<string, string>, days: ReadonlySet<string>): boolean {
    const written = [...days].sort().join(' ');
    if ((props[MOVED_DAYS_PROPERTY] ?? '') === written) {
        return false;
    }
    if (written === '') {
        delete props.GCAL_MOVED;
    } else {
        props.GCAL_MOVED = written;
    }
    return true;
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
    const summary: SyncSummary = {
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        deferred: 0,
        failed: 0,
        changes: []
    };
    const note = (action: SyncAction, task: Task, error?: string) =>
        summary.changes.push({ action, date: task.timestamp_date, heading: task.heading, error });

    // Within a file, handle tasks bottom-up so writing one task's
    // org-properties block (which grows the file) never shifts the 1-based
    // line of a task we have not handled yet -- otherwise the writer's
    // heading-anchor check fails and the lower task is deferred for no reason.
    // We hold no live, auto-tracking marker on each task (unlike Emacs
    // org-gcal); bottom-up ordering is the equivalent for our snapshot model.
    // Order across files is irrelevant: edits and Google calls are independent.
    const ordered = [...deps.tasks].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : b.line - a.line));

    // Built once from the list as it stands, for the reason the extractor
    // builds its own once per run: which occurrences an entry is missing
    // depends on the other entries, since a replacement lives in an entry of
    // its own (extractor ADR-0031).
    const replaced = collectReplacedOccurrences(deps.tasks);

    let consecutiveFailures = 0;
    const now = deps.now ?? Date.now;

    for (const task of ordered) {
        if (deps.signal?.aborted) {
            break;
        }
        if (deps.deadlineAt !== undefined && now() > deps.deadlineAt) {
            summary.stoppedEarly = 'time budget for this run was used up';
            break;
        }
        const props: Record<string, string> = { ...(task.properties ?? {}) };
        // A CANCELLED task must NEVER be pushed: it can still carry an active
        // SCHEDULED/DEADLINE timestamp (so isSyncable is true), but its linked
        // event must be deleted unconditionally -- unlike DONE, this does not
        // depend on deps.onDone (which only governs DONE).
        let failedThisTask = false;
        // Set where an occurrence's refusal reached the run's failure limit:
        // the entry's own loop has to end, and it is inside the `try`.
        let stopRun = false;
        const wantDelete =
            !isSyncable(task) || isCancelled(task.task_type) || (task.task_type === 'DONE' && deps.onDone === 'delete');

        try {
            if (wantDelete) {
                const eid = linkedEventId(props);
                if (eid) {
                    await deleteEvent(deps.fetchFn, deps.getToken, deps.calendarId, eid, { signal: deps.signal });
                    summary.deleted++;
                    note('deleted', task);
                } else {
                    summary.skipped++;
                }
                // An entry that is no longer pushed takes its occurrences with
                // it: each one is an event of its own, and the entry's own
                // deletion says nothing about them.
                const orgId = props.ID;
                if (orgId) {
                    for (const day of movedDaysRemembered(props)) {
                        await deleteEvent(deps.fetchFn, deps.getToken, deps.calendarId, movedEventId(orgId, day), {
                            signal: deps.signal
                        });
                        summary.deleted++;
                        summary.changes.push({ action: 'deleted', date: day, heading: task.heading });
                    }
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
                    note('deferred', task);
                    continue;
                }
            }
            // A day the notes no longer name has no event to stand for it:
            // the line was taken out, and nothing else in the calendar points
            // back at the move. Done before the series is written so the day
            // is free again by the time the rule expands over it.
            const named = new Set(
                (task.moved_occurrences ?? []).map((moved) => moved.from).filter((day) => isIsoDate(day))
            );
            const heldDays = new Set(movedDaysRemembered(props));
            for (const day of [...heldDays].sort()) {
                if (named.has(day)) {
                    continue;
                }
                await deleteEvent(deps.fetchFn, deps.getToken, deps.calendarId, movedEventId(orgId, day), {
                    signal: deps.signal
                });
                heldDays.delete(day);
                summary.deleted++;
                summary.changes.push({ action: 'deleted', date: day, heading: task.heading });
            }

            const eventId = taskIdToEventId(orgId);
            const event = mapTaskToEvent(task, orgId, deps.mapOptions(task), occurrencesMissingFrom(task, replaced));
            event.id = eventId;

            const res = await insertEvent(deps.fetchFn, deps.getToken, deps.calendarId, event, { signal: deps.signal });
            if (res.status === 'conflict') {
                await patchEvent(deps.fetchFn, deps.getToken, deps.calendarId, eventId, event, { signal: deps.signal });
                summary.updated++;
                note('updated', task);
            } else {
                summary.created++;
                note('created', task);
            }

            props.GCAL_EVENT_ID = eventId;

            // An occurrence held on another day (extractor ADR-0038) leaves as
            // an event of its own: the day it left is already out of the rule
            // as an EXDATE, and Google has no way to be handed an instance
            // override on an event it has not expanded yet. Its id is derived
            // from the series' and the day, so a later run patches this event
            // rather than writing a second one.
            //
            // Each one is written inside a `try` of its own: the entry has
            // already gone out, so a refusal here is that occurrence's rather
            // than the entry's -- counting it against the entry would report
            // one entry as both created and failed, and would drop every
            // occurrence after the refused one.
            for (const moved of task.moved_occurrences ?? []) {
                if (!isIsoDate(moved.from)) {
                    // Refused before the calendar is asked, for the reason the
                    // same day is left out of the EXDATE: a `MOVED` line is
                    // written by hand, and Google would answer this only after
                    // the entry itself had been written.
                    summary.failed++;
                    summary.changes.push({
                        action: 'failed',
                        date: moved.to,
                        heading: task.heading,
                        error: `the day a move names is not a day: "${moved.from}"`
                    });
                    continue;
                }
                try {
                    await writeMovedOccurrence(deps, summary, task, orgId, moved);
                    heldDays.add(moved.from);
                } catch (e) {
                    const reason = formatError(e);
                    summary.failed++;
                    summary.changes.push({ action: 'failed', date: moved.to, heading: task.heading, error: reason });
                    failedThisTask = true;
                    consecutiveFailures++;
                    if (consecutiveFailures >= CONSECUTIVE_FAILURES_BEFORE_STOP) {
                        summary.stoppedEarly = reason;
                        stopRun = true;
                        break;
                    }
                }
            }

            // Both properties are caches -- the event id is derived from `ID`,
            // and the days are what the calendar already holds -- so a
            // deferred write is harmless: the next run derives the one and
            // deletes by the other. Outcome intentionally ignored.
            const daysChanged = rememberMovedDays(props, heldDays);
            if (daysChanged || props.GCAL_EVENT_ID !== task.properties?.GCAL_EVENT_ID) {
                await deps.writer.write(task.file, task.line, task.heading, props);
            }
            if (stopRun) {
                break;
            }
        } catch (e) {
            const reason = formatError(e);
            summary.failed++;
            note('failed', task, reason);
            failedThisTask = true;
            consecutiveFailures++;
            if (consecutiveFailures >= CONSECUTIVE_FAILURES_BEFORE_STOP) {
                summary.stoppedEarly = reason;
                break;
            }
        } finally {
            // `finally`, not the tail of `try`: the body leaves through several
            // `continue`s (nothing to do, write-back deferred), and those are
            // successes too -- the counter has to reset for them as well.
            if (!failedThisTask) {
                consecutiveFailures = 0;
            }
        }
    }

    return summary;
}

/**
 * Write one occurrence held on another day, as an event of its own.
 *
 * Insert first and patch on the conflict the deterministic id gives: a second
 * run over an unchanged move must reach the event it wrote before rather than
 * make another beside it.
 */
async function writeMovedOccurrence(
    deps: SyncDeps,
    summary: SyncSummary,
    task: Task,
    orgId: string,
    moved: MovedOccurrence
): Promise<void> {
    const held = mapMovedOccurrenceToEvent(task, orgId, moved, deps.mapOptions(task));
    const heldId = movedEventId(orgId, moved.from);
    held.id = heldId;
    const placed = await insertEvent(deps.fetchFn, deps.getToken, deps.calendarId, held, { signal: deps.signal });
    if (placed.status === 'conflict') {
        await patchEvent(deps.fetchFn, deps.getToken, deps.calendarId, heldId, held, { signal: deps.signal });
        summary.updated++;
        summary.changes.push({ action: 'updated', date: moved.to, heading: task.heading });
    } else {
        summary.created++;
        summary.changes.push({ action: 'created', date: moved.to, heading: task.heading });
    }
}
