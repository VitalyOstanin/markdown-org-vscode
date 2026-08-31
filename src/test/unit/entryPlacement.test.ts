import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { placeNewEntry } from '../../utils/entryPlacement';

const NOTE = [
    '# Notes',
    '',
    '## Errands',
    '    `SCHEDULED: <2026-08-31 пн>`',
    'Some text under the note.',
    '',
    '## Other',
    'text'
];

suite('placeNewEntry', () => {
    test('the entry joins the note the cursor stands in, one level deeper', () => {
        const placement = placeNewEntry(NOTE, 2, 4);

        assert.strictEqual(placement.hashes, '###');
        // Line 6 is `## Other`: the entry goes after the note's own text and
        // before the heading that ends it.
        assert.strictEqual(placement.line, 5);
    });

    test('the blank line between notes stays between them', () => {
        // Written after the blank rather than before it, the entry would drift
        // one line further from its heading with every phrase.
        const placement = placeNewEntry(NOTE, 2, 4);

        assert.strictEqual((NOTE[placement.line] ?? '').trim(), '');
    });

    test('the planning indent is the one the note already writes', () => {
        assert.strictEqual(placeNewEntry(NOTE, 2, 4).indent, '    ');
    });

    test('a note with no planning line of its own is given four spaces', () => {
        const lines = ['## Errands', 'text'];

        assert.strictEqual(placeNewEntry(lines, 0, 1).indent, '    ');
    });

    test('the headings nested inside the note are stepped over', () => {
        // "In this note" means after everything under it, its own subheadings
        // included -- otherwise the entry would land between the note and its
        // first child.
        const lines = ['## Errands', '', '### Today', 'text', '', '## Other'];
        const placement = placeNewEntry(lines, 0, 3);

        assert.strictEqual(placement.line, 4);
        assert.strictEqual(placement.hashes, '###');
    });

    test('a note that ends the file is appended to', () => {
        const lines = ['# Notes', '', '## Errands', 'text'];
        const placement = placeNewEntry(lines, 2, 3);

        assert.strictEqual(placement.line, lines.length);
        assert.strictEqual(placement.blankAfter, false);
    });

    test('a blank line is asked for when the line above carries text', () => {
        const lines = ['## Errands', 'text'];

        assert.strictEqual(placeNewEntry(lines, 0, 1).blankBefore, true);
    });

    test('a blank line at the end of a note is not one more line to write after', () => {
        // The blank belongs to the gap between notes, so the entry is written
        // before it and still needs a blank of its own above.
        const lines = ['## Errands', 'text', ''];
        const placement = placeNewEntry(lines, 0, 1);

        assert.strictEqual(placement.line, 2);
        assert.strictEqual(placement.blankBefore, true);
    });

    test('nothing is asked for above an entry that stands after a blank line', () => {
        const lines = ['text', '', 'more'];

        assert.strictEqual(placeNewEntry(lines, null, 2).blankBefore, false);
    });

    test('a file with no heading above the cursor writes at the cursor', () => {
        const lines = ['plain text', 'more text'];
        const placement = placeNewEntry(lines, null, 1);

        assert.strictEqual(placement.line, 1);
        assert.strictEqual(placement.hashes, '#');
        assert.strictEqual(placement.blankBefore, true);
        assert.strictEqual(placement.blankAfter, true);
    });

    test('an empty file takes the entry as it is', () => {
        const placement = placeNewEntry([''], null, 0);

        assert.strictEqual(placement.line, 0);
        assert.strictEqual(placement.blankBefore, false);
        assert.strictEqual(placement.blankAfter, false);
    });

    test('a top-level note takes a second-level entry', () => {
        const lines = ['# Journal', 'text'];

        assert.strictEqual(placeNewEntry(lines, 0, 1).hashes, '##');
    });
});
