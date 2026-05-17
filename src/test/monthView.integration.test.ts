import * as assert from 'assert';
import { suite, test } from 'mocha';

// End-to-end coverage for `markdown-org.showAgendaMonth` lives in
// `agenda.integration.test.ts`, which stubs the extractor so it does not
// depend on `markdown-org-extract` being installed on the CI runner. The
// remaining cases below are calendar-grid helpers that don't touch VS Code
// commands directly — they're kept here for historical proximity to the
// month-view feature.
suite('Month View Integration Tests', () => {
    test('should identify days with tasks correctly', () => {
        const mockAgendaData = [
            {
                date: '2025-12-01',
                scheduled_timed: [],
                scheduled_no_time: [{ heading: 'Task 1' }],
                upcoming: [],
                overdue: []
            },
            { date: '2025-12-02', scheduled_timed: [], scheduled_no_time: [], upcoming: [], overdue: [] },
            {
                date: '2025-12-06',
                scheduled_timed: [{ heading: 'Task 2' }],
                scheduled_no_time: [],
                upcoming: [],
                overdue: []
            }
        ];

        const daysWithTasks = mockAgendaData.filter((day) => {
            const taskCount =
                (day.overdue || []).length +
                (day.scheduled_timed || []).length +
                (day.scheduled_no_time || []).length +
                (day.upcoming || []).length;
            return taskCount > 0;
        });

        assert.strictEqual(daysWithTasks.length, 2);
        assert.strictEqual(daysWithTasks[0].date, '2025-12-01');
        assert.strictEqual(daysWithTasks[1].date, '2025-12-06');
    });

    test('should correctly calculate first day of month', () => {
        const testCases = [
            { year: 2025, month: 11, expectedDay: 0 }, // December 2025 starts on Monday
            { year: 2025, month: 0, expectedDay: 2 } // January 2025 starts on Wednesday
        ];

        testCases.forEach(({ year, month, expectedDay }) => {
            const firstDay = new Date(year, month, 1);
            let startDay = firstDay.getDay();
            startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Monday = 0
            assert.strictEqual(startDay, expectedDay);
        });
    });

    test('should handle month navigation correctly', () => {
        const currentDate = new Date('2025-12-06');

        // Next month
        const nextMonth = new Date(currentDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        assert.strictEqual(nextMonth.getMonth(), 0); // January
        assert.strictEqual(nextMonth.getFullYear(), 2026);

        // Previous month
        const prevMonth = new Date(currentDate);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        assert.strictEqual(prevMonth.getMonth(), 10); // November
        assert.strictEqual(prevMonth.getFullYear(), 2025);
    });

    test('should format dates consistently', () => {
        const testDates = [
            { input: new Date(2025, 11, 6), expected: '2025-12-06' },
            { input: new Date(2025, 0, 1), expected: '2025-01-01' },
            { input: new Date(2025, 11, 31), expected: '2025-12-31' }
        ];

        testDates.forEach(({ input, expected }) => {
            const formatted = `${input.getFullYear()}-${String(input.getMonth() + 1).padStart(2, '0')}-${String(input.getDate()).padStart(2, '0')}`;
            assert.strictEqual(formatted, expected);
        });
    });
});
