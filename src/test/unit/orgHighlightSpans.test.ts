import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import type { HighlightKind, HighlightSpan } from '../../utils/orgHighlightSpans';
import { computeHighlightSpans } from '../../utils/orgHighlightSpans';

/** The spans of one line as `kind:text` pairs, so a case reads as what it paints. */
function painted(lineText: string): string[] {
    return computeHighlightSpans(lineText).map(
        (span: HighlightSpan) => `${span.kind}:${lineText.slice(span.start, span.end)}`
    );
}

function kinds(lineText: string): HighlightKind[] {
    return computeHighlightSpans(lineText).map((span) => span.kind);
}

/** The stretches the decorations leave to the injection grammar. */
function unpainted(lineText: string): string[] {
    const spans = computeHighlightSpans(lineText).sort((left, right) => left.start - right.start);
    const gaps: string[] = [];
    let cursor = lineText.length - lineText.trimStart().length;
    for (const span of spans) {
        if (span.start > cursor) {
            gaps.push(lineText.slice(cursor, span.start));
        }
        cursor = Math.max(cursor, span.end);
    }
    const end = lineText.trimEnd().length;
    if (cursor < end) {
        gaps.push(lineText.slice(cursor, end));
    }
    return gaps;
}

suite('computeHighlightSpans', () => {
    test('a planning line paints the keyword and every timestamp part', () => {
        assert.deepStrictEqual(painted('`SCHEDULED: <2026-03-03 Tue 10:00 +7d -2d>`'), [
            'planning-scheduled:SCHEDULED',
            'date:2026-03-03',
            'weekday:Tue',
            'time:10:00',
            'repeater:+7d',
            'warning:-2d'
        ]);
    });

    test('the punctuation is left to the injection grammar', () => {
        // The backticks, the colon, the brackets and the spaces between the
        // parts are not decorated: the injection grammar marks the whole line as
        // inline code, so they keep the colour the theme gives inline code --
        // the same one they have at shallow indentation without any of this.
        assert.deepStrictEqual(unpainted('`SCHEDULED: <2026-03-03 Tue 10:00 +7d>`'), ['`', ': <', ' ', ' ', ' ', '>`']);
    });

    test('the indentation itself is never decorated', () => {
        const line = '    `SCHEDULED: <2026-03-03 Tue +7d>`';
        const leftmost = Math.min(...computeHighlightSpans(line).map((span) => span.start));
        // Column 5 is the `S` of the keyword: the four spaces and the backtick
        // stay outside every span.
        assert.strictEqual(leftmost, 5);
    });

    test('four spaces of indentation change nothing', () => {
        // The reason this module exists: the markdown grammar reads a line
        // indented by four spaces as an indented code block and tokenizes
        // nothing inside it, while the extractor reads the planning line.
        const indented = painted('    `SCHEDULED: <2026-03-03 Tue +7d>`');
        const plain = painted('`SCHEDULED: <2026-03-03 Tue +7d>`');
        assert.deepStrictEqual(indented, plain);
    });

    test('a tab of indentation changes nothing either', () => {
        assert.deepStrictEqual(painted('\t`DEADLINE: <2026-03-05 Thu>`'), [
            'planning-deadline:DEADLINE',
            'date:2026-03-05',
            'weekday:Thu'
        ]);
    });

    test('backticks are optional', () => {
        assert.deepStrictEqual(painted('  DEADLINE: <2026-03-05 Thu>'), [
            'planning-deadline:DEADLINE',
            'date:2026-03-05',
            'weekday:Thu'
        ]);
    });

    test('each planning keyword gets its own kind', () => {
        assert.deepStrictEqual(kinds('`CLOSED: [2026-03-05 Thu 18:00]`'), [
            'planning-closed',
            'date',
            'weekday',
            'time'
        ]);
        assert.deepStrictEqual(kinds('`CREATED: [2026-03-01 Sun]`'), ['planning-created', 'date', 'weekday']);
    });

    test('a CLOCK line paints both endpoints', () => {
        const line = '`CLOCK: [2026-03-03 Tue 10:00]--[2026-03-03 Tue 11:30] => 1:30`';
        assert.deepStrictEqual(painted(line), [
            'planning-clock:CLOCK',
            'date:2026-03-03',
            'weekday:Tue',
            'time:10:00',
            'date:2026-03-03',
            'weekday:Tue',
            'time:11:30'
        ]);
        // The range separator and the `=> H:MM` duration are not timestamp
        // parts, so they stay with the rest of the punctuation.
        assert.deepStrictEqual(unpainted(line), ['`', ': [', ' ', ' ', ']--[', ' ', ' ', '] => 1:30`']);
    });

    test('a heading paints the status keyword and the priority cookie', () => {
        assert.deepStrictEqual(painted('### TODO [#A] Сдать показания воды'), ['status-todo:TODO', 'priority-a:[#A]']);
        assert.deepStrictEqual(painted('## DONE [#B] Полить цветы'), ['status-done:DONE', 'priority-b:[#B]']);
        assert.deepStrictEqual(painted('# CANCELLED [#C] Забрать посылку'), [
            'status-cancelled:CANCELLED',
            'priority-c:[#C]'
        ]);
    });

    test('the American spelling of CANCELED is accepted', () => {
        assert.deepStrictEqual(kinds('### CANCELED Забрать посылку'), ['status-cancelled']);
    });

    test('priorities the agenda leaves plain stay plain here too', () => {
        // The agenda chips A, B and C only, so a `[#D]` or a numeric cookie
        // gets no colour rather than a colour the agenda never shows.
        assert.deepStrictEqual(kinds('### TODO [#D] Разобрать шкаф'), ['status-todo']);
        assert.deepStrictEqual(kinds('### TODO [#12] Разобрать шкаф'), ['status-todo']);
    });

    test('a cookie away from the front is painted where it was typed', () => {
        // The extractor reads a cookie wherever it sits (its ADR-0027) and
        // leaves it in the heading text. Painting only the canonical position
        // would colour the priority on one line and not on the next, for the
        // same priority.
        assert.deepStrictEqual(painted('### TODO Купить [#A] фильтр'), ['status-todo:TODO', 'priority-a:[#A]']);
        assert.deepStrictEqual(painted('### Заголовок с cookie в конце [#B]'), ['priority-b:[#B]']);
    });

    test('a heading without a status or a cookie paints nothing', () => {
        assert.deepStrictEqual(painted('### Проверить все жидкости в машине'), []);
    });

    test('a status keyword outside a heading is left alone', () => {
        // Body text mentioning a keyword is prose, not a task line: only the
        // heading pattern (`#` prefix, keyword right after it) counts.
        assert.deepStrictEqual(painted('Написать, что задача TODO и приоритет [#A]'), []);
    });

    test('a planning keyword needs its colon', () => {
        assert.deepStrictEqual(painted('Слово SCHEDULED без двоеточия'), []);
    });

    test('a bare timestamp in prose is painted', () => {
        // Inline plain timestamps are what the extractor reads off a body line,
        // so they carry the same colours as the ones on a planning line.
        assert.deepStrictEqual(painted('встреча <2026-03-03 Tue 10:00>'), [
            'date:2026-03-03',
            'weekday:Tue',
            'time:10:00'
        ]);
    });

    test('a mixed bracket pair is not a timestamp', () => {
        const line = '`SCHEDULED: <2026-03-03 Tue]`';
        assert.deepStrictEqual(painted(line), ['planning-scheduled:SCHEDULED']);
        // A malformed timestamp gets no part colours, so the whole remainder
        // reads as the plain inline-code text of a planning line.
        assert.deepStrictEqual(unpainted(line), ['`', ': <2026-03-03 Tue]`']);
    });

    test('a line without org constructs paints nothing', () => {
        assert.deepStrictEqual(painted('Обычный абзац про 2026 год и [ссылку](https://example.com)'), []);
    });

    test('spans stay inside the line and never overlap', () => {
        const line = '### TODO [#A] Задача с `SCHEDULED: <2026-03-03 Tue 10:00 +7d>`';
        const spans = computeHighlightSpans(line).sort((a, b) => a.start - b.start);
        let previousEnd = 0;
        for (const span of spans) {
            assert.ok(span.start >= previousEnd, `span ${span.kind} at ${span.start} overlaps the previous one`);
            assert.ok(span.end <= line.length, `span ${span.kind} ends past the line`);
            assert.ok(span.end > span.start, `span ${span.kind} is empty`);
            previousEnd = span.end;
        }
    });

    test('a repeated call on the same line yields the same spans', () => {
        // The scan patterns are module-level and stateful (`g` keeps
        // `lastIndex`), so a second pass must not start where the first stopped.
        const line = '`SCHEDULED: <2026-03-03 Tue +7d>`';
        assert.deepStrictEqual(painted(line), painted(line));
    });
});
