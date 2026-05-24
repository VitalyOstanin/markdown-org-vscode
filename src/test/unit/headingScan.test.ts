import * as assert from 'assert';
import { collectSiblingKeywordsFromLines } from '../../utils/headingScan';

suite('collectSiblingKeywordsFromLines', () => {
    test('collects sibling keywords inside the same heading section', () => {
        const lines = [
            '## TODO Task',
            '`CREATED: [2026-05-01 Fri]`',
            '`SCHEDULED: <2026-05-31 Sun>`',
            '`CLOSED: [2026-05-31 Sun 12:00]`'
        ];
        // Cursor on the CLOSED line (index 3): the cycle is about to
        // rewrite it, so CLOSED itself must not appear in `used`.
        const used = collectSiblingKeywordsFromLines(lines, 3);
        assert.deepStrictEqual([...used].sort(), ['CREATED', 'SCHEDULED']);
    });

    test('the cursor line is always excluded from the result', () => {
        const lines = ['## TODO Task', '`SCHEDULED: <2026-05-01 Fri>`'];
        const used = collectSiblingKeywordsFromLines(lines, 1);
        assert.deepStrictEqual([...used], []);
    });

    test('scan stops at the next heading (no leakage into the next section)', () => {
        const lines = [
            '## TODO First',
            '`SCHEDULED: <2026-05-01 Fri>`',
            '## TODO Second',
            '`DEADLINE: <2026-06-01 Mon>`',
            '`CLOSED: [2026-06-02 Tue]`'
        ];
        // Cursor on the SCHEDULED line of the first heading. The
        // DEADLINE / CLOSED below belong to a different section and
        // must not pollute the result.
        const used = collectSiblingKeywordsFromLines(lines, 1);
        assert.deepStrictEqual([...used], []);
    });

    test('scan walks upward to the section start (skip preceding text lines)', () => {
        const lines = [
            '## TODO Task',
            'Some prose description.',
            '',
            '`SCHEDULED: <2026-05-01 Fri>`',
            '`CLOSED: [2026-05-02 Sat]`',
            'More prose.',
            '`CREATED: [2026-04-30 Thu]`'
        ];
        const used = collectSiblingKeywordsFromLines(lines, 6);
        assert.deepStrictEqual([...used].sort(), ['CLOSED', 'SCHEDULED']);
    });

    test('returns the keywords from a preamble when no heading precedes', () => {
        const lines = ['`SCHEDULED: <2026-05-01 Fri>`', '`DEADLINE: <2026-05-31 Sun>`'];
        const used = collectSiblingKeywordsFromLines(lines, 0);
        assert.deepStrictEqual([...used], ['DEADLINE']);
    });

    test('ignores lines that do not declare a known keyword', () => {
        const lines = [
            '## TODO Task',
            '`CLOCK: [2026-05-01 Fri 10:00]`',
            '`SCHEDULED: <2026-05-31 Sun>`',
            'Regular text.',
            '`UNKNOWN: [2026-05-31 Sun]`',
            '`CLOSED: [2026-05-31 Sun 12:00]`'
        ];
        const used = collectSiblingKeywordsFromLines(lines, 1);
        assert.deepStrictEqual([...used].sort(), ['CLOSED', 'SCHEDULED']);
    });

    test('exits early once all four known keywords have been observed', () => {
        // 1000 sibling lines, the first four cover every keyword; the
        // scan must not walk further. Verified indirectly: a stray
        // unknown keyword far below would be ignored anyway, but the
        // contract is "size === 4 -> stop".
        const lines: string[] = ['## TODO Task'];
        lines.push('`SCHEDULED: <2026-05-01 Fri>`');
        lines.push('`DEADLINE: <2026-05-02 Sat>`');
        lines.push('`CLOSED: [2026-05-03 Sun]`');
        lines.push('`CREATED: [2026-04-30 Thu]`');
        for (let i = 0; i < 1000; i++) {
            lines.push('Padding line.');
        }
        const used = collectSiblingKeywordsFromLines(lines, 0);
        assert.strictEqual(used.size, 4);
    });

    test('indented keyword lines are still recognised', () => {
        const lines = ['## TODO Task', '    `SCHEDULED: <2026-05-01 Fri>`', '\t`DEADLINE: <2026-05-31 Sun>`'];
        const used = collectSiblingKeywordsFromLines(lines, 0);
        assert.deepStrictEqual([...used].sort(), ['DEADLINE', 'SCHEDULED']);
    });
});
