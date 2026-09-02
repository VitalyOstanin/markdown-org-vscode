import * as assert from 'node:assert/strict';
import { collectReplacedOccurrences, occurrencesMissingFrom } from '../../../utils/gcal/seriesExceptions';
import type { Task } from '../../../types';

const series: Task = {
    file: '/w/notes.md',
    line: 10,
    heading: 'English',
    content: '',
    task_type: 'TODO',
    timestamp_type: 'SCHEDULED',
    timestamp_active: true,
    timestamp_date: '2026-08-13',
    timestamp_time: '15:00',
    timestamp_repeater: '+1w',
    properties: { ID: 'series-1' }
};

/** The entry that stands in for one occurrence of `seriesId`. */
function replacement(seriesId: string, recurrenceId: string): Task {
    return {
        file: '/w/moved.md',
        line: 3,
        heading: 'English, moved',
        content: '',
        task_type: 'TODO',
        timestamp_type: 'SCHEDULED',
        timestamp_active: true,
        timestamp_date: '2026-08-20',
        timestamp_time: '18:00',
        series_id: seriesId,
        recurrence_id: recurrenceId,
        properties: { SERIES_ID: seriesId, RECURRENCE_ID: recurrenceId }
    };
}

suite('gcal/seriesExceptions', () => {
    test('an occurrence another entry stands in for is missing from the series', () => {
        const replaced = collectReplacedOccurrences([series, replacement('series-1', '2026-08-20 15:00')]);

        assert.deepEqual(occurrencesMissingFrom(series, replaced), ['2026-08-20']);
    });

    test("a replacement's own day is not what it replaces: the date comes from RECURRENCE_ID", () => {
        // The entry sits on the 22nd and stands in for the occurrence of the
        // 20th. Excluding the 22nd would take out a day the series never had
        // and leave the 20th showing twice.
        const moved = { ...replacement('series-1', '2026-08-20 15:00'), timestamp_date: '2026-08-22' };
        const replaced = collectReplacedOccurrences([series, moved]);

        assert.deepEqual(occurrencesMissingFrom(series, replaced), ['2026-08-20']);
    });

    test('a replacement of another series leaves this one alone', () => {
        const replaced = collectReplacedOccurrences([series, replacement('series-2', '2026-08-20')]);

        assert.deepEqual(occurrencesMissingFrom(series, replaced), []);
    });

    test('half a pair replaces nothing', () => {
        const { recurrence_id: _dropped, ...half } = replacement('series-1', '2026-08-20');
        const replaced = collectReplacedOccurrences([series, half]);

        assert.deepEqual(occurrencesMissingFrom(series, replaced), []);
    });

    test('both reasons meet in one answer, sorted and without repeats', () => {
        const cancelled = { ...series, excluded_dates: ['2026-08-27', '2026-08-20'] };
        const replaced = collectReplacedOccurrences([cancelled, replacement('series-1', '2026-08-20 15:00')]);

        assert.deepEqual(occurrencesMissingFrom(cancelled, replaced), ['2026-08-20', '2026-08-27']);
    });

    test('a series without an ID cannot be replaced, but can still cancel its own', () => {
        const { properties: _none, ...anonymous } = series;
        const cancelling = { ...(anonymous as Task), excluded_dates: ['2026-08-20'] };
        const replaced = collectReplacedOccurrences([cancelling, replacement('series-1', '2026-08-20')]);

        assert.deepEqual(occurrencesMissingFrom(cancelling, replaced), ['2026-08-20']);
    });

    test('a date nothing can read is left out rather than passed on to the calendar', () => {
        const cancelling = { ...series, excluded_dates: ['last thursday', '2026-08-20'] };
        const replaced = collectReplacedOccurrences([cancelling]);

        assert.deepEqual(occurrencesMissingFrom(cancelling, replaced), ['2026-08-20']);
    });

    test('a RECURRENCE_ID that is not a date replaces no occurrence', () => {
        // The property is written by hand, so it can say anything. A value the
        // date reader cannot make sense of must not take a day out of the
        // series: the occurrence would vanish from the calendar with nothing
        // standing in for it.
        const unreadable = replacement('series-1', 'the week after next');
        const replaced = collectReplacedOccurrences([series, unreadable]);

        assert.deepEqual(occurrencesMissingFrom(series, replaced), []);
    });
});
