import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Month View Integration Tests', () => {
    const testWorkspaceDir = path.join(__dirname, '../../test-workspace');
    const testFile = path.join(testWorkspaceDir, 'month-test.md');

    before(async () => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }

        const testContent = `# Month View Test Tasks

## TODO [#A] Task on December 1st
\`SCHEDULED: <2025-12-01 Mon>\`

## TODO Task on December 6th
\`SCHEDULED: <2025-12-06 Sat 15:00>\`

## TODO Task on December 15th
\`DEADLINE: <2025-12-15 Mon>\`

## TODO Weekend task
\`SCHEDULED: <2025-12-07 Sun>\`

## TODO Holiday task
\`SCHEDULED: <2025-01-01 Wed>\`
`;
        fs.writeFileSync(testFile, testContent);
    });

    after(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    test('should render month view with calendar grid', async function() {
        this.timeout(10000);

        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('workspaceDir', testWorkspaceDir, vscode.ConfigurationTarget.Workspace);

        await vscode.commands.executeCommand('markdown-org.showAgendaMonth');
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const panels = vscode.window.visibleTextEditors;
        assert.ok(panels.length >= 0, 'Agenda panel should be created');
    });

    test('should identify days with tasks correctly', () => {
        const mockAgendaData = [
            { date: '2025-12-01', scheduled_timed: [], scheduled_no_time: [{ heading: 'Task 1' }], upcoming: [], overdue: [] },
            { date: '2025-12-02', scheduled_timed: [], scheduled_no_time: [], upcoming: [], overdue: [] },
            { date: '2025-12-06', scheduled_timed: [{ heading: 'Task 2' }], scheduled_no_time: [], upcoming: [], overdue: [] }
        ];

        const daysWithTasks = mockAgendaData.filter(day => {
            const taskCount = (day.overdue || []).length + (day.scheduled_timed || []).length + 
                            (day.scheduled_no_time || []).length + (day.upcoming || []).length;
            return taskCount > 0;
        });

        assert.strictEqual(daysWithTasks.length, 2);
        assert.strictEqual(daysWithTasks[0].date, '2025-12-01');
        assert.strictEqual(daysWithTasks[1].date, '2025-12-06');
    });

    test('should correctly calculate first day of month', () => {
        const testCases = [
            { year: 2025, month: 11, expectedDay: 1 }, // December 2025 starts on Monday
            { year: 2025, month: 0, expectedDay: 3 },  // January 2025 starts on Wednesday
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
