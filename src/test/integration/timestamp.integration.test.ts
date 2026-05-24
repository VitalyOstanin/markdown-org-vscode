import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { suite, test } from 'mocha';

suite('Timestamp Integration Tests', () => {
    let document: vscode.TextDocument;
    let editor: vscode.TextEditor;

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Insert CREATED timestamp', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertCreated');

        const line1 = document.lineAt(1).text;
        // ADR-0014: CREATED is inactive `[...]`.
        assert.ok(line1.startsWith('`CREATED: ['), `expected inactive CREATED, got: ${line1}`);
        assert.ok(line1.endsWith(']`'), `expected closing ], got: ${line1}`);
    });

    test('Insert SCHEDULED timestamp', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertScheduled');

        const line1 = document.lineAt(1).text;
        assert.ok(line1.startsWith('`SCHEDULED: <'));
        assert.ok(line1.endsWith('>`'));
    });

    test('Insert DEADLINE timestamp', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertDeadline');

        const line1 = document.lineAt(1).text;
        assert.ok(line1.startsWith('`DEADLINE: <'));
        assert.ok(line1.endsWith('>`'));
    });

    test('Toggle SCHEDULED removes it', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n`SCHEDULED: <2025-12-06 Fri>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertScheduled');

        assert.strictEqual(document.lineCount, 2);
        assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
    });

    test('Toggle SCHEDULED removes all duplicate SCHEDULED lines, not just the last', async () => {
        // Regression: insertOrReplaceTimestamp used to track only the most
        // recently seen line for the type, so a file that accidentally ended
        // up with two SCHEDULED entries kept the older one after a toggle.
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n' + '`SCHEDULED: <2025-12-06 Fri>`\n' + '`SCHEDULED: <2025-12-07 Sat>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertScheduled');

        const remaining = document
            .getText()
            .split('\n')
            .filter((l) => l.includes('SCHEDULED:'));
        assert.deepStrictEqual(remaining, [], 'all SCHEDULED lines must be removed by the toggle');
        assert.strictEqual(document.lineAt(0).text, '## TODO Task title');
    });

    test('Toggle SCHEDULED with duplicates preserves CREATED and DEADLINE', async () => {
        document = await vscode.workspace.openTextDocument({
            content:
                '## TODO Task title\n' +
                '`CREATED: [2025-12-01 Mon]`\n' +
                '`DEADLINE: <2025-12-31 Wed>`\n' +
                '`SCHEDULED: <2025-12-06 Fri>`\n' +
                '`SCHEDULED: <2025-12-07 Sat>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertScheduled');

        const lines = document.getText().split('\n');
        assert.ok(lines.some((l) => l.startsWith('`CREATED:')));
        assert.ok(lines.some((l) => l.startsWith('`DEADLINE:')));
        assert.ok(
            !lines.some((l) => l.startsWith('`SCHEDULED:')),
            'no SCHEDULED line should survive a toggle on a duplicated entry'
        );
    });

    test('SCHEDULED preserves existing DEADLINE', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n`DEADLINE: <2025-12-06 Fri>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertScheduled');

        assert.ok(document.lineAt(1).text.startsWith('`DEADLINE: <'));
        assert.ok(document.lineAt(2).text.startsWith('`SCHEDULED: <'));
    });

    test('DEADLINE preserves existing SCHEDULED', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task title\n`SCHEDULED: <2025-12-06 Fri>`\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertDeadline');

        assert.ok(document.lineAt(1).text.startsWith('`SCHEDULED: <'));
        assert.ok(document.lineAt(2).text.startsWith('`DEADLINE: <'));
    });

    test('Timestamp Up increments day', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`SCHEDULED: <2025-12-06 Fri>`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 22, 0, 22);

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('2025-12-07'));
    });

    test('Timestamp Down decrements day', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`SCHEDULED: <2025-12-06 Fri>`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 22, 0, 22);

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('2025-12-05'));
    });

    test('Timestamp Up on type cycles SCHEDULED to DEADLINE', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`SCHEDULED: <2025-12-06 Fri>`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 5, 0, 5); // cursor on SCHEDULED

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.startsWith('`DEADLINE:'));
    });

    test('weekdayLocale=en makes insertScheduled emit Mon/Tue/... names', async () => {
        const cfg = vscode.workspace.getConfiguration('markdown-org');
        await cfg.update('weekdayLocale', 'en', vscode.ConfigurationTarget.Workspace);
        try {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO English-locale task\n',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(0, 0, 0, 0);

            await vscode.commands.executeCommand('markdown-org.insertScheduled');

            const inserted = document.lineAt(1).text;
            assert.ok(inserted.startsWith('`SCHEDULED:'), `expected SCHEDULED line, got: ${inserted}`);
            const englishDays = new Set(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
            const match = inserted.match(/<\d{4}-\d{2}-\d{2}\s+(\S+)\s/);
            assert.ok(match, `cannot extract weekday from: ${inserted}`);
            assert.ok(englishDays.has(match![1]), `weekday "${match![1]}" is not an English short name`);
        } finally {
            await cfg.update('weekdayLocale', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    test('weekdayLocale default keeps Russian names (back-compat)', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Default-locale task\n',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.insertScheduled');

        const inserted = document.lineAt(1).text;
        const russianDays = new Set(['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']);
        const match = inserted.match(/<\d{4}-\d{2}-\d{2}\s+(\S+)\s/);
        assert.ok(match, `cannot extract weekday from: ${inserted}`);
        assert.ok(russianDays.has(match![1]), `weekday "${match![1]}" should default to Russian`);
    });

    // Repeater preservation across day-shift commands: all three prefixes
    // (`+`, `++`, `.+`) and the workday `wd` / hour `h` units that
    // markdown-org-extract recognizes must survive a timestampUp/Down on the
    // date. Before the regex extension only `+\d+[dwmy]{1,2}` matched, so
    // shifting a `++1w` date silently dropped the repeater on reconstruction.
    const repeaterCases: { repeater: string; label: string }[] = [
        { repeater: '+1d', label: 'cumulative day' },
        { repeater: '+2w', label: 'cumulative week' },
        { repeater: '+3m', label: 'cumulative month' },
        { repeater: '+1y', label: 'cumulative year' },
        { repeater: '+4h', label: 'hour repeater' },
        { repeater: '+1wd', label: 'workday repeater' },
        { repeater: '++1w', label: 'catch-up week' },
        { repeater: '.+1m', label: 'restart month' }
    ];

    for (const { repeater, label } of repeaterCases) {
        test(`Timestamp Up on day preserves ${label} (${repeater})`, async () => {
            document = await vscode.workspace.openTextDocument({
                content: `\`SCHEDULED: <2025-12-06 Fri ${repeater}>\``,
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            // Cursor on the day "06".
            editor.selection = new vscode.Selection(0, 21, 0, 21);

            await vscode.commands.executeCommand('markdown-org.timestampUp');

            const line = document.lineAt(0).text;
            assert.ok(line.includes('2025-12-07'), `expected day to increment, got: ${line}`);
            assert.ok(line.includes(repeater), `expected ${repeater} to survive, got: ${line}`);
        });
    }

    test('CLOCK start hour increment', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: [2025-12-09 Mon 14:30]--[2025-12-09 Mon 16:00] =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 24, 0, 24); // cursor on start hour "14"

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('[2025-12-09 Tue 15:30]'), `Expected hour 15, got: ${line}`);
        assert.ok(line.includes('=>  0:30'), `Expected duration 0:30, got: ${line}`);
    });

    test('CLOCK start minute increment', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: [2025-12-09 Mon 14:30]--[2025-12-09 Mon 16:00] =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 27, 0, 27); // cursor on start minute "30"

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('[2025-12-09 Tue 14:31]'), `Expected minute 31, got: ${line}`);
        assert.ok(line.includes('=>  1:29'), `Expected duration 1:29, got: ${line}`);
    });

    test('CLOCK end hour increment', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: [2025-12-09 Mon 14:30]--[2025-12-09 Mon 16:00] =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 48, 0, 48); // cursor on end hour "16"

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('[2025-12-09 Tue 17:00]'), `Expected hour 17, got: ${line}`);
        assert.ok(line.includes('=>  2:30'), `Expected duration 2:30, got: ${line}`);
    });

    test('CLOCK end minute decrement', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: [2025-12-09 Mon 14:30]--[2025-12-09 Mon 16:00] =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 51, 0, 51); // cursor on end minute "00"

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('[2025-12-09 Tue 15:59]'), `Expected minute 59, got: ${line}`);
        assert.ok(line.includes('=>  1:29'), `Expected duration 1:29, got: ${line}`);
    });

    test('CLOCK with angle brackets', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: <2025-12-09 Mon 14:30>--<2025-12-09 Mon 16:00> =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 24, 0, 24); // cursor on start hour

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('<2025-12-09 Tue 15:30>'), `Expected angle brackets and hour 15, got: ${line}`);
        assert.ok(line.includes('=>  0:30'), `Expected duration 0:30, got: ${line}`);
    });

    test('CLOCK with Russian short weekday', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: [2025-12-09 Пн 14:30]--[2025-12-09 Пн 16:00] =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 27, 0, 27); // cursor on start minute

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('[2025-12-09 Вт 14:31]'), `Expected Russian weekday Вт, got: ${line}`);
        assert.ok(line.includes('=>  1:29'), `Expected duration 1:29, got: ${line}`);
    });

    test('CLOCK with English full weekday', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: [2025-12-09 Monday 14:30]--[2025-12-09 Monday 16:00] =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 54, 0, 54); // cursor on end hour

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('[2025-12-09 Tuesday 17:00]'), `Expected full weekday Tuesday, got: ${line}`);
        assert.ok(line.includes('=>  2:30'), `Expected duration 2:30, got: ${line}`);
    });

    test('CLOCK with Russian full weekday', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOCK: <2025-12-09 Понедельник 14:30>--<2025-12-09 Понедельник 16:00> =>  1:30`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 67, 0, 67); // cursor on end minute

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        const line = document.lineAt(0).text;
        assert.ok(line.includes('<2025-12-09 Вторник 15:59>'), `Expected full Russian weekday Вторник, got: ${line}`);
        assert.ok(line.includes('=>  1:29'), `Expected duration 1:29, got: ${line}`);
    });

    // ADR-0014: markdown-org.toggleTimestampActive flips `<>` <-> `[]` on bare
    // inline timestamps. On a keyword line (SCHEDULED/DEADLINE/CLOSED/CREATED)
    // the bracket form is fixed by the keyword, so the command refuses to flip.
    test('toggleTimestampActive flips bare inline `<...>` to `[...]`', async () => {
        document = await vscode.workspace.openTextDocument({
            content: 'See <2025-12-06 Fri 14:30> in calendar',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 5, 0, 5); // inside the year

        await vscode.commands.executeCommand('markdown-org.toggleTimestampActive');

        assert.strictEqual(document.lineAt(0).text, 'See [2025-12-06 Fri 14:30] in calendar');
    });

    test('toggleTimestampActive flips bare inline `[...]` to `<...>`', async () => {
        document = await vscode.workspace.openTextDocument({
            content: 'Archived [2025-12-06 Fri 14:30]',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 12, 0, 12);

        await vscode.commands.executeCommand('markdown-org.toggleTimestampActive');

        assert.strictEqual(document.lineAt(0).text, 'Archived <2025-12-06 Fri 14:30>');
    });

    test('toggleTimestampActive refuses to flip on a SCHEDULED line (bracket fixed by keyword)', async () => {
        const line = '`SCHEDULED: <2025-12-06 Fri>`';
        document = await vscode.workspace.openTextDocument({ content: line, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 15, 0, 15); // inside the year

        await vscode.commands.executeCommand('markdown-org.toggleTimestampActive');

        assert.strictEqual(document.lineAt(0).text, line, 'keyword-line bracket must stay fixed');
    });

    test('toggleTimestampActive refuses to flip on a CREATED line', async () => {
        const line = '`CREATED: [2025-12-06 Fri]`';
        document = await vscode.workspace.openTextDocument({ content: line, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 13, 0, 13);

        await vscode.commands.executeCommand('markdown-org.toggleTimestampActive');

        assert.strictEqual(document.lineAt(0).text, line, 'CREATED bracket form must stay inactive');
    });

    test('toggleTimestampActive is a no-op when cursor is not on a timestamp', async () => {
        const line = 'Just narrative prose without timestamps.';
        document = await vscode.workspace.openTextDocument({ content: line, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 10, 0, 10);

        await vscode.commands.executeCommand('markdown-org.toggleTimestampActive');

        assert.strictEqual(document.lineAt(0).text, line);
    });

    // Cycle reachability: any column on a keyword line that is NOT inside
    // the bracketed body must trigger the keyword cycle. The earlier
    // implementation only fired when the cursor was inside the keyword
    // token itself, so positions on the colon / on the gap before the
    // bracket / on the trailing backtick fell into the `cursorUpSelect`
    // fallback. The four tests below pin down the regression boundary
    // (indices for `` `CLOSED: [` `` are: 0=`, 1..6=CLOSED, 7=:, 8=space,
    // 9=`[`).
    const closedLine = '`CLOSED: [2025-12-31 Wed]`';

    test('Shift+Down on column 7 (the colon) cycles the keyword', async () => {
        document = await vscode.workspace.openTextDocument({ content: closedLine, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 7, 0, 7);

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        assert.ok(
            document.lineAt(0).text.startsWith('`CREATED:'),
            `cursor on the colon should cycle, got: ${document.lineAt(0).text}`
        );
    });

    test('Shift+Down on column 8 (gap between `:` and `[`) cycles the keyword', async () => {
        document = await vscode.workspace.openTextDocument({ content: closedLine, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 8, 0, 8);

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        assert.ok(
            document.lineAt(0).text.startsWith('`CREATED:'),
            `cursor right after the colon should cycle, got: ${document.lineAt(0).text}`
        );
    });

    test('Shift+Down on column 0 (before backtick) still cycles the keyword', async () => {
        document = await vscode.workspace.openTextDocument({ content: closedLine, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        assert.ok(
            document.lineAt(0).text.startsWith('`CREATED:'),
            `cursor at start of line should cycle, got: ${document.lineAt(0).text}`
        );
    });

    test('Shift+Down at end of the keyword line cycles the keyword', async () => {
        document = await vscode.workspace.openTextDocument({ content: closedLine, language: 'markdown' });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, closedLine.length, 0, closedLine.length);

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        assert.ok(
            document.lineAt(0).text.startsWith('`CREATED:'),
            `cursor at end of line should cycle, got: ${document.lineAt(0).text}`
        );
    });

    // CREATED joins the cycle (CLOSED -> CREATED -> SCHEDULED).
    test('Shift+Down on CLOSED cycles to CREATED and preserves `[...]`', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CLOSED: [2025-12-31 Wed]`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 5, 0, 5); // inside CLOSED

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        assert.strictEqual(document.lineAt(0).text, '`CREATED: [2025-12-31 Wed]`');
    });

    test('Shift+Down on CREATED cycles to SCHEDULED and flips bracket to `<...>`', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '`CREATED: [2025-12-31 Wed]`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 5, 0, 5); // inside CREATED

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        assert.strictEqual(document.lineAt(0).text, '`SCHEDULED: <2025-12-31 Wed>`');
    });

    // Duplicate-skip: the cycle never produces two lines of the same
    // keyword under one heading. The cursor line is excluded from the
    // "occupied" set (its slot frees up as the cycle replaces it), so
    // only sibling keyword lines count.
    test('Shift+Down on CLOSED skips DEADLINE when DEADLINE is already present', async () => {
        document = await vscode.workspace.openTextDocument({
            content: '## TODO Task\n`CLOSED: [2025-12-31 Wed]`\n`DEADLINE: <2026-01-15 Thu>`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(1, 5, 1, 5); // inside CLOSED

        // Natural step: CLOSED -> CREATED. CREATED is free, so the
        // cycle should land there. This test fixes the "no duplicate"
        // contract for a sibling we are NOT skipping; the next test
        // exercises the actual skip.
        await vscode.commands.executeCommand('markdown-org.timestampDown');
        assert.strictEqual(document.lineAt(1).text, '`CREATED: [2025-12-31 Wed]`');
    });

    test('Shift+Down on SCHEDULED skips occupied DEADLINE and surfaces a status-bar hint', async () => {
        const statusStub = sinon.stub(vscode.window, 'setStatusBarMessage');
        try {
            document = await vscode.workspace.openTextDocument({
                content: '## TODO Task\n`SCHEDULED: <2025-12-31 Wed>`\n`DEADLINE: <2026-01-15 Thu>`',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(1, 5, 1, 5); // inside SCHEDULED

            await vscode.commands.executeCommand('markdown-org.timestampDown');

            // SCHEDULED -> (DEADLINE occupied -> skip) -> CLOSED.
            assert.strictEqual(document.lineAt(1).text, '`CLOSED: [2025-12-31 Wed]`');
            assert.strictEqual(document.lineAt(2).text, '`DEADLINE: <2026-01-15 Thu>`');

            // The skip is communicated through the status bar, not a toast.
            assert.strictEqual(statusStub.callCount, 1, 'one status-bar message per skip');
            // setStatusBarMessage has overloads; sinon types the args as a 1-tuple
            // even when 2 args are passed, so widen for the second-arg check.
            const args = statusStub.firstCall.args as unknown as [string, number];
            assert.match(args[0], /Skipped DEADLINE \(already on heading\)/);
            assert.strictEqual(args[1], 3000, 'status hint auto-dismisses in 3s');
        } finally {
            statusStub.restore();
        }
    });

    test('Shift+Down on SCHEDULED skips DEADLINE and CLOSED, status bar names both', async () => {
        const statusStub = sinon.stub(vscode.window, 'setStatusBarMessage');
        try {
            document = await vscode.workspace.openTextDocument({
                content:
                    '## TODO Task\n' +
                    '`SCHEDULED: <2025-12-31 Wed>`\n' +
                    '`DEADLINE: <2026-01-15 Thu>`\n' +
                    '`CLOSED: [2026-01-20 Tue]`',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(1, 5, 1, 5); // inside SCHEDULED

            await vscode.commands.executeCommand('markdown-org.timestampDown');

            assert.strictEqual(document.lineAt(1).text, '`CREATED: [2025-12-31 Wed]`');
            assert.strictEqual(statusStub.callCount, 1);
            assert.match(statusStub.firstCall.args[0] as string, /Skipped DEADLINE, CLOSED \(already on heading\)/);
        } finally {
            statusStub.restore();
        }
    });

    test('Shift+Down is a no-op when every other slot is occupied AND warns via toast', async () => {
        const warnStub = sinon.stub(vscode.window, 'showWarningMessage');
        const statusStub = sinon.stub(vscode.window, 'setStatusBarMessage');
        try {
            const closed = '`CLOSED: [2025-12-31 Wed]`';
            document = await vscode.workspace.openTextDocument({
                content:
                    '## TODO Task\n' +
                    '`SCHEDULED: <2025-12-31 Wed>`\n' +
                    '`DEADLINE: <2026-01-15 Thu>`\n' +
                    closed +
                    '\n' +
                    '`CREATED: [2025-12-01 Mon]`',
                language: 'markdown'
            });
            editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(3, 5, 3, 5); // inside CLOSED

            await vscode.commands.executeCommand('markdown-org.timestampDown');

            // Line text is preserved -- there is no free target.
            assert.strictEqual(document.lineAt(3).text, closed);

            // Escalates to a warning toast (not the quiet status bar).
            assert.strictEqual(warnStub.callCount, 1, 'no-op must escalate to a warning toast');
            assert.match(
                warnStub.firstCall.args[0] as string,
                /Cannot cycle CLOSED: CREATED, DEADLINE, SCHEDULED are already on this heading\./
            );
            assert.strictEqual(statusStub.callCount, 0, 'no status-bar message on a pure no-op');
        } finally {
            warnStub.restore();
            statusStub.restore();
        }
    });

    test('skip-duplicates respects heading boundaries (next-section keywords do not count)', async () => {
        document = await vscode.workspace.openTextDocument({
            content:
                '## TODO First\n' +
                '`SCHEDULED: <2025-12-31 Wed>`\n' +
                '## TODO Second\n' +
                '`DEADLINE: <2026-02-01 Sun>`\n' +
                '`CLOSED: [2026-02-02 Mon]`',
            language: 'markdown'
        });
        editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(1, 5, 1, 5); // SCHEDULED in the FIRST heading

        await vscode.commands.executeCommand('markdown-org.timestampDown');

        // SCHEDULED is in the first section. DEADLINE / CLOSED below
        // live under a different heading -- they MUST NOT influence
        // the duplicate-skip, so the natural next step (DEADLINE) wins.
        assert.strictEqual(document.lineAt(1).text, '`DEADLINE: <2025-12-31 Wed>`');
        // Sibling section is untouched.
        assert.strictEqual(document.lineAt(3).text, '`DEADLINE: <2026-02-01 Sun>`');
        assert.strictEqual(document.lineAt(4).text, '`CLOSED: [2026-02-02 Mon]`');
    });
});
