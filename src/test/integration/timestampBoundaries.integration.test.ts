import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test, teardown } from 'mocha';

// Regression coverage for issue #41: `Shift+Up` in a SCHEDULED/DEADLINE line
// did nothing when the cursor sat right after a part of the timestamp -- e.g.
// after `-25` in `<2026-05-25 Пн 19:02>`. VS Code positions sit BETWEEN
// characters, so visually "after 25" is the boundary column 11 chars past
// `<`; the original half-open spans treated that as a separator and the
// command silently fell back to `cursorUpSelect`, producing line selection.
//
// Layouts the suite exercises (offset 0 = start of line):
//
//   `DEADLINE: <2026-05-25 Пн 19:02>`
//    0         1         2         3
//    0123456789012345678901234567890123
//
//   tsStart = 11 (`<`), tsEnd = 32 (one past `>`).
//   year    [12, 16), month [17, 19), day [20, 22),
//   weekday [23, 25), hour  [26, 28), minute [29, 31).
//
// The same offsets shift by 1 for `SCHEDULED:` (10 chars vs. 9 for DEADLINE).
// Each test states the absolute column it uses so the file is self-documenting.

const DEADLINE_LINE = '`DEADLINE: <2026-05-25 Пн 19:02>`';
const SCHEDULED_LINE = '`SCHEDULED: <2026-05-25 Пн 19:02 +1d>`';
// ADR-0014: CREATED/CLOSED are emitted in inactive `[...]` form. Bracket
// characters occupy the same columns as `<`/`>`, so all boundary offsets
// in the cases below stay valid.
const CREATED_DATE_ONLY = '`CREATED: [2026-05-25 Пн]`';
const CLOSED_LINE = '`CLOSED: [2026-05-25 Пн 19:02]`';
const BARE_TIMESTAMP = '<2026-05-25 Пн 19:02>';
const DEADLINE_WITH_REPEATER = '`DEADLINE: <2026-05-25 Пн 19:02 ++1w>`';

interface Case {
    label: string;
    line: string;
    cursor: number;
    expectContains: string;
    expectMissing?: string;
    delta?: 1 | -1;
}

async function runCase(c: Case): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
        content: c.line,
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, c.cursor, 0, c.cursor);

    const command = (c.delta ?? 1) > 0 ? 'markdown-org.timestampUp' : 'markdown-org.timestampDown';
    await vscode.commands.executeCommand(command);

    const result = document.lineAt(0).text;
    assert.ok(
        result.includes(c.expectContains),
        `[${c.label}] cursor at ${c.cursor} on "${c.line}": expected "${c.expectContains}" in "${result}"`
    );
    if (c.expectMissing) {
        assert.ok(
            !result.includes(c.expectMissing),
            `[${c.label}] cursor at ${c.cursor} on "${c.line}": did not expect "${c.expectMissing}" in "${result}"`
        );
    }
}

suite('Timestamp cursor boundaries (issue #41)', () => {
    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    // --- DEADLINE: every column inside the timestamp shifts the right part.
    // Cases marked `// boundary` are the ones the bug originally broke.
    const deadlineCases: Case[] = [
        // year
        { label: 'DEADLINE year first digit', line: DEADLINE_LINE, cursor: 12, expectContains: '2027-05-25' },
        { label: 'DEADLINE year last digit', line: DEADLINE_LINE, cursor: 15, expectContains: '2027-05-25' },
        { label: 'DEADLINE year boundary (on `-`)', line: DEADLINE_LINE, cursor: 16, expectContains: '2027-05-25' }, // boundary
        // month
        { label: 'DEADLINE month first digit', line: DEADLINE_LINE, cursor: 17, expectContains: '2026-06-25' },
        { label: 'DEADLINE month last digit', line: DEADLINE_LINE, cursor: 18, expectContains: '2026-06-25' },
        { label: 'DEADLINE month boundary (on `-`)', line: DEADLINE_LINE, cursor: 19, expectContains: '2026-06-25' }, // boundary
        // day -- the bug reporter's exact reproduction
        { label: 'DEADLINE day first digit', line: DEADLINE_LINE, cursor: 20, expectContains: '2026-05-26' },
        { label: 'DEADLINE day last digit', line: DEADLINE_LINE, cursor: 21, expectContains: '2026-05-26' },
        { label: 'DEADLINE day boundary (on ` `)', line: DEADLINE_LINE, cursor: 22, expectContains: '2026-05-26' }, // boundary
        // weekday -- shifts the day via Date arithmetic; weekday name updates accordingly
        { label: 'DEADLINE weekday first letter', line: DEADLINE_LINE, cursor: 23, expectContains: '2026-05-26' },
        { label: 'DEADLINE weekday last letter', line: DEADLINE_LINE, cursor: 24, expectContains: '2026-05-26' },
        { label: 'DEADLINE weekday boundary (on ` `)', line: DEADLINE_LINE, cursor: 25, expectContains: '2026-05-26' }, // boundary
        // hour
        { label: 'DEADLINE hour first digit', line: DEADLINE_LINE, cursor: 26, expectContains: '20:02' },
        { label: 'DEADLINE hour last digit', line: DEADLINE_LINE, cursor: 27, expectContains: '20:02' },
        { label: 'DEADLINE hour boundary (on `:`)', line: DEADLINE_LINE, cursor: 28, expectContains: '20:02' }, // boundary
        // minute
        { label: 'DEADLINE minute first digit', line: DEADLINE_LINE, cursor: 29, expectContains: '19:03' },
        { label: 'DEADLINE minute last digit', line: DEADLINE_LINE, cursor: 30, expectContains: '19:03' },
        { label: 'DEADLINE minute boundary (on `>`)', line: DEADLINE_LINE, cursor: 31, expectContains: '19:03' } // boundary
    ];

    for (const c of deadlineCases) {
        test(c.label, async () => {
            await runCase(c);
        });
    }

    // --- SCHEDULED with a repeater (`+1d`): offsets shift by one because
    // `SCHEDULED:` is one char longer than `DEADLINE:`. Verify a sampling of
    // boundary positions plus that the `+1d` repeater survives.
    const scheduledCases: Case[] = [
        // day boundary -- offset 23 (was 22 in DEADLINE)
        {
            label: 'SCHEDULED day boundary preserves +1d',
            line: SCHEDULED_LINE,
            cursor: 23,
            expectContains: '2026-05-26',
            expectMissing: undefined
        },
        { label: 'SCHEDULED day boundary preserves repeater', line: SCHEDULED_LINE, cursor: 23, expectContains: '+1d' },
        // weekday boundary -- offset 26
        {
            label: 'SCHEDULED weekday boundary increments day',
            line: SCHEDULED_LINE,
            cursor: 26,
            expectContains: '2026-05-26'
        },
        // hour boundary -- offset 29 (on `:`)
        { label: 'SCHEDULED hour boundary increments hour', line: SCHEDULED_LINE, cursor: 29, expectContains: '20:02' },
        // minute boundary -- offset 32 (on ` ` before +1d)
        {
            label: 'SCHEDULED minute boundary increments minute',
            line: SCHEDULED_LINE,
            cursor: 32,
            expectContains: '19:03'
        }
    ];

    for (const c of scheduledCases) {
        test(c.label, async () => {
            await runCase(c);
        });
    }

    // --- timestampDown on a boundary mirrors timestampUp.
    test('DEADLINE day boundary decrements (Shift+Down)', async () => {
        await runCase({
            label: 'DEADLINE day boundary down',
            line: DEADLINE_LINE,
            cursor: 22,
            expectContains: '2026-05-24',
            delta: -1
        });
    });

    // --- CREATED without weekday/hour: only year/month/day spans. The boundary
    // just past the day sits ON `]`, which used to drop the request.
    test('CREATED date-only day boundary (just past 25) increments day', async () => {
        // `CREATED: [2026-05-25 Пн]` -- length 25 incl. backticks.
        //  0         1         2
        //  012345678901234567890123456
        //  `CREATED: [2026-05-25 Пн]`
        // year [11, 15), month [16, 18), day [19, 21), weekday [22, 24)
        // boundary right after `25` is column 21.
        await runCase({
            label: 'CREATED day boundary on space',
            line: CREATED_DATE_ONLY,
            cursor: 21,
            expectContains: '2026-05-26'
        });
    });

    // --- Bare timestamp (no SCHEDULED/DEADLINE wrapper, no backticks) so the
    // line is not handled by TIMESTAMP_LINE_REGEX -- only by TIMESTAMP_REGEX.
    // Used to confirm the fix lives in getTimestampPartAt, not in something
    // type-specific.
    test('Bare timestamp day boundary increments day', async () => {
        // `<2026-05-25 Пн 19:02>` -- tsStart=0.
        // year [1,5), month [6,8), day [9,11), weekday [12,14), hour [15,17), minute [18,20)
        // boundary right after `25` is column 11.
        await runCase({
            label: 'bare timestamp day boundary',
            line: BARE_TIMESTAMP,
            cursor: 11,
            expectContains: '2026-05-26'
        });
    });

    // --- Existing happy-path "on the digit" cases must keep working: a fix
    // that turns boundaries into hits must not change behavior on a digit
    // (we'd have spotted that in the deadlineCases above, but a SCHEDULED
    // mid-day test covers a different file shape).
    test('SCHEDULED on day digit keeps incrementing day (no regression)', async () => {
        // SCHEDULED day at col 21 (the `2` of `25`).
        await runCase({
            label: 'SCHEDULED day digit',
            line: SCHEDULED_LINE,
            cursor: 21,
            expectContains: '2026-05-26'
        });
    });

    // --- CLOSED uses the inactive `[...]` form per ADR-0014. The bare
    // TIMESTAMP_REGEX from timestampParts.ts accepts both forms paired, so
    // all six boundary positions resolve the same way.
    //
    // Layout for `\`CLOSED: [2026-05-25 Пн 19:02]\``:
    //    0         1         2         3
    //    0123456789012345678901234567890
    //    `CLOSED: [2026-05-25 Пн 19:02]`
    //   year [10,14), month [15,17), day [18,20), weekday [21,23),
    //   hour [24,26), minute [27,29).
    const closedCases: Case[] = [
        { label: 'CLOSED year boundary (on `-`)', line: CLOSED_LINE, cursor: 14, expectContains: '2027-05-25' },
        { label: 'CLOSED month boundary (on `-`)', line: CLOSED_LINE, cursor: 17, expectContains: '2026-06-25' },
        { label: 'CLOSED day boundary (on ` `)', line: CLOSED_LINE, cursor: 20, expectContains: '2026-05-26' },
        { label: 'CLOSED weekday boundary (on ` `)', line: CLOSED_LINE, cursor: 23, expectContains: '2026-05-26' },
        { label: 'CLOSED hour boundary (on `:`)', line: CLOSED_LINE, cursor: 26, expectContains: '20:02' },
        { label: 'CLOSED minute boundary (on `]`)', line: CLOSED_LINE, cursor: 29, expectContains: '19:03' }
    ];

    for (const c of closedCases) {
        test(c.label, async () => {
            await runCase(c);
        });
    }

    // --- CLOSED type cycling: like SCHEDULED -> DEADLINE, the type wheel
    // must reach CLOSED and wrap around back to SCHEDULED on further presses.
    test('CLOSED type cycles to SCHEDULED (wrap)', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: CLOSED_LINE,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        // Column 3 lands on `O` of `CLOSED`.
        editor.selection = new vscode.Selection(0, 3, 0, 3);
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.ok(
            document.lineAt(0).text.startsWith('`SCHEDULED:'),
            `expected wrap to SCHEDULED, got: ${document.lineAt(0).text}`
        );
    });

    // --- Repeater behavior on boundary positions. The repeater itself has
    // no part-span (it cannot be incremented component-wise), but it must
    // not be lost when the boundary-fallback fires on the minute/`>` side.
    //
    // Layout for `\`DEADLINE: <2026-05-25 Пн 19:02 ++1w>\`` (length 38):
    //    0         1         2         3
    //    0123456789012345678901234567890123456789
    //    `DEADLINE: <2026-05-25 Пн 19:02 ++1w>`
    //   minute [29, 31), ` ` at 31, repeater `++1w` at 32-35, `>` at 36.
    //
    // Notes on the repeater token:
    //   - `+` / `++` / `.+` are valid prefixes; `++1w` is a "catch-up" weekly
    //     repeater (markdown-org-extract calls this `CatchUp`).
    //   - On `<`-only column 32 the cursor sits on the first `+`, which has
    //     no span and (after fallback) `character - 1 = 31` is the space, so
    //     the lookup must return null and timestampUp must NOT mutate the line.
    test('DEADLINE with repeater: minute boundary on ` ` before repeater', async () => {
        await runCase({
            label: 'DEADLINE repeater minute boundary',
            line: DEADLINE_WITH_REPEATER,
            cursor: 31,
            expectContains: '19:03'
        });
    });

    test('DEADLINE with repeater: repeater survives minute boundary increment', async () => {
        await runCase({
            label: 'DEADLINE repeater preserved',
            line: DEADLINE_WITH_REPEATER,
            cursor: 31,
            expectContains: '++1w'
        });
    });

    test('DEADLINE with repeater: cursor on `+` does not mutate the line', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: DEADLINE_WITH_REPEATER,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        // Column 32 is the first `+` of `++1w`.
        editor.selection = new vscode.Selection(0, 32, 0, 32);
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(
            document.lineAt(0).text,
            DEADLINE_WITH_REPEATER,
            'cursor on the repeater token has no part-span and must not edit the line'
        );
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('DEADLINE with repeater: cursor on `w` (repeater unit) does not mutate the line', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: DEADLINE_WITH_REPEATER,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        // Column 35 is `w` of `++1w`.
        editor.selection = new vscode.Selection(0, 35, 0, 35);
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(
            document.lineAt(0).text,
            DEADLINE_WITH_REPEATER,
            'cursor on the repeater unit letter must not edit the line'
        );
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('DEADLINE with repeater: cursor on `>` past repeater does not mutate the line', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: DEADLINE_WITH_REPEATER,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        // Column 36 is `>`. Left-leaning lands on `w` which is in the
        // repeater (no span), so nothing changes.
        editor.selection = new vscode.Selection(0, 36, 0, 36);
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(
            document.lineAt(0).text,
            DEADLINE_WITH_REPEATER,
            'cursor on `>` past a repeater has no fall-back into a part'
        );
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    // --- Repeater preservation across day-shift on a boundary position.
    // The existing `timestamp.integration.test.ts` covers on-digit positions
    // for all repeater prefixes (`+`, `++`, `.+`) and units (`d`, `w`, `m`,
    // `y`, `h`, `wd`); here we verify the SAME shapes survive when the
    // cursor sits on the boundary that issue #41 originally broke.
    const boundaryRepeaters = ['+1d', '+2w', '+3m', '+1y', '+4h', '+1wd', '++1w', '.+1m'];
    for (const repeater of boundaryRepeaters) {
        test(`day boundary preserves repeater "${repeater}"`, async () => {
            const line = `\`SCHEDULED: <2026-05-25 Пн ${repeater}>\``;
            // SCHEDULED prefix offsets shift the `<` to col 12, so the day
            // boundary just past `25` lands at col 23.
            const document = await vscode.workspace.openTextDocument({
                content: line,
                language: 'markdown'
            });
            const editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(0, 23, 0, 23);
            await vscode.commands.executeCommand('markdown-org.timestampUp');
            const result = document.lineAt(0).text;
            assert.ok(result.includes('2026-05-26'), `repeater "${repeater}": day must increment, got: ${result}`);
            assert.ok(
                result.includes(repeater),
                `repeater "${repeater}": must survive the boundary edit, got: ${result}`
            );
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });
    }

    // --- Inactive `[...]` timestamps (ADR-0014). Bare inline form is
    // exercised here; per-keyword line forms are covered separately.
    test('inline inactive timestamp: Shift+Up increments day and preserves square brackets', async () => {
        const line = 'Reference [2026-05-25 Пн 19:02] in prose';
        const document = await vscode.workspace.openTextDocument({
            content: line,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        // Column 21 is the first day digit `2` of `25`.
        editor.selection = new vscode.Selection(0, 21, 0, 21);
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        const result = document.lineAt(0).text;
        assert.ok(result.includes('[2026-05-26'), `inactive day must increment, got: ${result}`);
        assert.ok(result.endsWith('in prose'), `surrounding text preserved, got: ${result}`);
        assert.ok(!result.includes('<2026-05-26'), `bracket form must stay inactive, got: ${result}`);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('inline inactive timestamp: cursor on boundary past `26` still increments day', async () => {
        // 2026-05-26 is Вт (Tuesday); +1 day → 2026-05-27 Ср (Wednesday).
        const line = '[2026-05-26 Вт 09:00]';
        const document = await vscode.workspace.openTextDocument({
            content: line,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        // Column 11 is the space past the day -- left-leaning fallback lands on day.
        editor.selection = new vscode.Selection(0, 11, 0, 11);
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(document.lineAt(0).text, '[2026-05-27 Ср 09:00]');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('inline mixed pair `<...]` is not editable (cursor falls through to cursorUpSelect)', async () => {
        // ADR-0014 rejects mixed pairs. `getTimestampPartAt` returns null,
        // so `timestampUp` falls back to line motion and leaves the text intact.
        const line = '<2026-05-25 Пн 19:02]';
        const document = await vscode.workspace.openTextDocument({
            content: line,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('markdown-org.timestampUp');
        assert.strictEqual(document.lineAt(0).text, line, 'mixed pair must not be edited');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    // --- Cursor outside the timestamp (e.g. on the leading backtick or
    // before `<`) is not a part-hit; the command must fall back to
    // `cursorUpSelect` and leave the line text intact.
    test('Cursor before `<` leaves the line unchanged (falls back to cursorUpSelect)', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: DEADLINE_LINE,
            language: 'markdown'
        });
        const editor = await vscode.window.showTextDocument(document);
        // Column 10 = the space between `:` and `<`.
        editor.selection = new vscode.Selection(0, 10, 0, 10);

        await vscode.commands.executeCommand('markdown-org.timestampUp');

        assert.strictEqual(
            document.lineAt(0).text,
            DEADLINE_LINE,
            'timestampUp on a non-part column should not mutate the line'
        );
    });
});
