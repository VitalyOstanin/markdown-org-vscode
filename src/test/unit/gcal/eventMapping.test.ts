import * as assert from 'node:assert/strict';
import { isSyncable, mapTaskToEvent, addDaysToIsoDate } from '../../../utils/gcal/eventMapping';
import type { Task } from '../../../types';

const base: Task = {
    file: '/w/notes.md',
    line: 10,
    heading: 'Ship release',
    content: 'Body.',
    task_type: 'TODO',
    timestamp_type: 'SCHEDULED',
    timestamp_active: true,
    timestamp_date: '2026-06-01'
};

const opts = { timeZone: 'Europe/Belgrade', defaultEventMinutes: 60, relPath: 'notes.md' };

/**
 * `base` without one optional field. The extractor emits JSON, which carries no
 * explicit `undefined`, so a missing field is a missing key -- and that is what
 * `exactOptionalPropertyTypes` insists the fixture spell out.
 */
function without(task: Task, key: keyof Task): Task {
    const { [key]: _dropped, ...rest } = task;
    return rest as Task;
}

suite('gcal/eventMapping', () => {
    test('isSyncable: active SCHEDULED/DEADLINE only', () => {
        assert.ok(isSyncable(base));
        assert.ok(isSyncable({ ...base, timestamp_type: 'DEADLINE' }));
        assert.ok(!isSyncable({ ...base, timestamp_active: false }));
        assert.ok(!isSyncable({ ...base, timestamp_type: 'CREATED' }));
        assert.ok(!isSyncable(without(base, 'timestamp_active')));
        assert.ok(!isSyncable(without(base, 'timestamp_date')));
    });

    test('a task with no timestamp is refused rather than sent as an event without a date', () => {
        // `isSyncable` is the gate, and every caller goes through it. A caller
        // that forgets would otherwise publish an event whose start is
        // `undefined`, which Google accepts as the epoch.
        assert.throws(() => mapTaskToEvent(without(base, 'timestamp_date'), 'org-1', opts), /not syncable/);
    });

    test('all-day event: end.date is exclusive (next day)', () => {
        const ev = mapTaskToEvent(base, 'oid', opts);
        assert.deepEqual(ev.start, { date: '2026-06-01' });
        assert.deepEqual(ev.end, { date: '2026-06-02' });
        assert.equal(ev.summary, 'Ship release');
        assert.match(ev.description ?? '', /Body\./);
        assert.match(ev.description ?? '', /Source: notes\.md:10/);
        const ext = ev.extendedProperties?.private;
        assert.ok(ext);
        assert.equal(ext.mdOrgId, 'oid');
        assert.equal(ext.mdOrgTsType, 'SCHEDULED');
    });

    test("event carries status 'confirmed' so re-publish revives a cancelled event", () => {
        // DONE -> TODO again reuses the deterministic id still held by the
        // soft-deleted (cancelled) event; the patch must set status back to
        // confirmed, otherwise the event stays invisible. Holds for all-day
        // and timed events alike.
        assert.equal(mapTaskToEvent(base, 'oid', opts).status, 'confirmed');
        assert.equal(mapTaskToEvent({ ...base, timestamp_time: '10:00' }, 'oid', opts).status, 'confirmed');
    });

    test('timed event with explicit end', () => {
        const ev = mapTaskToEvent({ ...base, timestamp_time: '10:00', timestamp_end_time: '11:30' }, 'oid', opts);
        assert.deepEqual(ev.start, { dateTime: '2026-06-01T10:00:00', timeZone: 'Europe/Belgrade' });
        assert.deepEqual(ev.end, { dateTime: '2026-06-01T11:30:00', timeZone: 'Europe/Belgrade' });
    });

    test('timed event without end uses default duration', () => {
        const ev = mapTaskToEvent({ ...base, timestamp_time: '23:30' }, 'oid', { ...opts, defaultEventMinutes: 60 });
        assert.deepEqual(ev.start, { dateTime: '2026-06-01T23:30:00', timeZone: 'Europe/Belgrade' });
        // 23:30 + 60m rolls into next day
        assert.deepEqual(ev.end, { dateTime: '2026-06-02T00:30:00', timeZone: 'Europe/Belgrade' });
    });

    test('timed event with non-positive end falls back to default duration', () => {
        const ev = mapTaskToEvent({ ...base, timestamp_time: '10:00', timestamp_end_time: '09:00' }, 'oid', {
            ...opts,
            defaultEventMinutes: 30
        });
        assert.deepEqual(ev.end, { dateTime: '2026-06-01T10:30:00', timeZone: 'Europe/Belgrade' });
    });

    test('timed event with end equal to start falls back to default duration', () => {
        // Boundary of the `<=` guard: a zero-length range is treated as missing.
        const ev = mapTaskToEvent({ ...base, timestamp_time: '10:00', timestamp_end_time: '10:00' }, 'oid', {
            ...opts,
            defaultEventMinutes: 45
        });
        assert.deepEqual(ev.end, { dateTime: '2026-06-01T10:45:00', timeZone: 'Europe/Belgrade' });
    });

    test('description is footer-only when the task has no body', () => {
        const ev = mapTaskToEvent({ ...base, content: '   ' }, 'oid', opts);
        assert.equal(ev.description, 'Source: notes.md:10');
    });

    test('addDaysToIsoDate rolls across a year boundary', () => {
        assert.equal(addDaysToIsoDate('2026-12-31', 1), '2027-01-01');
        assert.equal(addDaysToIsoDate('2026-01-01', -1), '2025-12-31');
    });

    test('repeater becomes a recurrence rule; instance start/end stay single-occurrence', () => {
        const ev = mapTaskToEvent({ ...base, timestamp_time: '14:00', timestamp_repeater: '++7d' }, 'oid', opts);
        assert.deepEqual(ev.recurrence, ['RRULE:FREQ=DAILY;INTERVAL=7']);
        // The start/end still describe one instance; Google expands the series.
        assert.deepEqual(ev.start, { dateTime: '2026-06-01T14:00:00', timeZone: 'Europe/Belgrade' });
        assert.deepEqual(ev.end, { dateTime: '2026-06-01T15:00:00', timeZone: 'Europe/Belgrade' });
    });

    test('no repeater sends an empty recurrence array (clears any prior series on patch)', () => {
        // Always present, never omitted: the upsert patches unconditionally
        // and Google PATCH is partial, so an absent field would leave a
        // formerly-recurring event stale after its repeater is removed.
        const ev = mapTaskToEvent(base, 'oid', opts);
        assert.deepEqual(ev.recurrence, []);
    });

    test('unrepresentable repeater (+2wd) leaves the event one-shot (empty recurrence)', () => {
        const ev = mapTaskToEvent({ ...base, timestamp_repeater: '+2wd' }, 'oid', opts);
        assert.deepEqual(ev.recurrence, []);
    });

    test('hourly repeater on an all-day task is dropped (Google rejects sub-daily on date-only)', () => {
        // base has no timestamp_time -> all-day event; FREQ=HOURLY would 400.
        const ev = mapTaskToEvent({ ...base, timestamp_repeater: '+1h' }, 'oid', opts);
        assert.deepEqual(ev.recurrence, []);
    });

    test('hourly repeater on a timed task is kept', () => {
        const ev = mapTaskToEvent({ ...base, timestamp_time: '10:00', timestamp_repeater: '+2h' }, 'oid', opts);
        assert.deepEqual(ev.recurrence, ['RRULE:FREQ=HOURLY;INTERVAL=2']);
    });

    test('occurrences the series does not have go out as an EXDATE line beside the rule', () => {
        // Without it the calendar keeps drawing an occurrence the panel has
        // stopped drawing -- and, when the occurrence moved, keeps it beside
        // the entry that replaced it, so the day holds two.
        const ev = mapTaskToEvent({ ...base, timestamp_time: '15:00', timestamp_repeater: '+1w' }, 'oid', opts, [
            '2026-06-08',
            '2026-06-15'
        ]);

        assert.deepEqual(ev.recurrence, [
            'RRULE:FREQ=WEEKLY',
            'EXDATE;TZID=Europe/Belgrade:20260608T150000,20260615T150000'
        ]);
    });

    test('an all-day series excludes by date, the value type its start uses', () => {
        // RFC 5545 requires the EXDATE value type to match DTSTART; a
        // date-time here is rejected by Google on a date-only event.
        const ev = mapTaskToEvent({ ...base, timestamp_repeater: '+1w' }, 'oid', opts, ['2026-06-08']);

        assert.deepEqual(ev.recurrence, ['RRULE:FREQ=WEEKLY', 'EXDATE;VALUE=DATE:20260608']);
    });

    test('an entry with no rule of its own sends no EXDATE', () => {
        // An EXDATE without an RRULE describes nothing, and Google rejects the
        // event. The repeater here has no single-rule form (+2wd), so the
        // event is one-shot and the exceptions have nothing to apply to.
        const ev = mapTaskToEvent({ ...base, timestamp_repeater: '+2wd' }, 'oid', opts, ['2026-06-08']);

        assert.deepEqual(ev.recurrence, []);
    });

    test('a series with no exceptions keeps the rule alone', () => {
        const ev = mapTaskToEvent({ ...base, timestamp_repeater: '+1w' }, 'oid', opts, []);

        assert.deepEqual(ev.recurrence, ['RRULE:FREQ=WEEKLY']);
    });
});
