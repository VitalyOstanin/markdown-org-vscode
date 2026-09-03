import * as assert from 'node:assert';
import { planPhraseInsert } from '../../utils/phraseInsert';

/**
 * Where a phrase-written entry goes and what exactly is written there.
 *
 * The command used to split the document on `\n` alone, so in a file with
 * CRLF endings every line carried a trailing `\r`: the heading pattern matched
 * nothing, the placement rule saw no note to join, and the text inserted mixed
 * LF into a file written with CRLF.
 */
suite('planPhraseInsert', () => {
    const entry = () => ['## TODO Buy bread', '    `SCHEDULED: <2026-09-04 Fri>`'];

    test('a file with CRLF endings is read as lines and written with CRLF', () => {
        const text = ['# Notes', '', 'text'].join('\r\n');

        const plan = planPhraseInsert({ text, headingLine: 0, cursorLine: 2, entry });

        assert.strictEqual(plan.line, 3, 'the entry joins the note, after its last line');
        assert.ok(!plan.text.includes('\n\n'), 'no bare LF is written into a CRLF file');
        assert.strictEqual(plan.text, '\r\n## TODO Buy bread\r\n    `SCHEDULED: <2026-09-04 Fri>`\r\n');
    });

    test('a file with LF endings is written with LF', () => {
        const text = ['# Notes', '', 'text'].join('\n');

        const plan = planPhraseInsert({ text, headingLine: 0, cursorLine: 2, entry });

        assert.strictEqual(plan.line, 3);
        assert.ok(!plan.text.includes('\r'), 'no CR is written into an LF file');
    });

    test('the heading level is read through the file it is in, CRLF or not', () => {
        // With the `\r` left on the line the placement rule found no heading
        // and wrote a top-level entry into the middle of a note.
        const text = ['## Note', 'text'].join('\r\n');

        const plan = planPhraseInsert({ text, headingLine: 0, cursorLine: 1, entry });

        assert.strictEqual(plan.hashes, '###', 'one level deeper than the note joined');
    });

    test('an empty file takes the entry at the cursor', () => {
        const plan = planPhraseInsert({ text: '', headingLine: null, cursorLine: 0, entry });

        assert.strictEqual(plan.line, 0);
        assert.strictEqual(plan.hashes, '#');
    });
});
