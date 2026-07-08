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

suite('gcal/eventMapping', () => {
    test('isSyncable: active SCHEDULED/DEADLINE only', () => {
        assert.ok(isSyncable(base));
        assert.ok(isSyncable({ ...base, timestamp_type: 'DEADLINE' }));
        assert.ok(!isSyncable({ ...base, timestamp_active: false }));
        assert.ok(!isSyncable({ ...base, timestamp_type: 'CREATED' }));
        assert.ok(!isSyncable({ ...base, timestamp_active: undefined }));
        assert.ok(!isSyncable({ ...base, timestamp_date: undefined }));
    });

    test('all-day event: end.date is exclusive (next day)', () => {
        const ev = mapTaskToEvent(base, 'oid', opts);
        assert.deepEqual(ev.start, { date: '2026-06-01' });
        assert.deepEqual(ev.end, { date: '2026-06-02' });
        assert.equal(ev.summary, 'Ship release');
        assert.match(ev.description ?? '', /Body\./);
        assert.match(ev.description ?? '', /Source: notes\.md:10/);
        assert.equal(ev.extendedProperties?.private?.mdOrgId, 'oid');
        assert.equal(ev.extendedProperties?.private?.mdOrgTsType, 'SCHEDULED');
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
});
