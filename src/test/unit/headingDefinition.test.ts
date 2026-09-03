import * as assert from 'node:assert';
import { HEADING_REGEX, headingLevel, isSectionBreak } from '../../orgPatterns';
import { placeNewEntry } from '../../utils/entryPlacement';

/**
 * One answer to "is this line a heading".
 *
 * The extension had three: the canonical `HEADING_REGEX`, a bare `^(#+)\s` in
 * the placement rule, and a CommonMark test in the properties reader. They
 * disagreed on `## ` with nothing after it, on seven hashes and on an indented
 * hash, so the same line was a heading to the command that inserts an entry
 * and not a heading to the command that edits one.
 *
 * What settles it is the extractor: `parse_heading_line` accepts one to six
 * hashes at the start of the line, followed by a space or a tab, and nothing
 * else -- that is the line both projects rewrite. Where a section ends is the
 * separate question the properties reader asks, and CommonMark answers it.
 */
suite('One definition of a heading', () => {
    test('a heading is one to six hashes and a space, as the extractor reads it', () => {
        assert.strictEqual(headingLevel('# Title'), 1);
        assert.strictEqual(headingLevel('###### Title'), 6);
        assert.strictEqual(headingLevel('##\tTitle'), 2);
        // Seven hashes are not a heading in markdown, and the extractor does
        // not read them as one.
        assert.strictEqual(headingLevel('####### Title'), null);
        // An indent makes it a heading for CommonMark but not a line this
        // extension rewrites: the extractor's own regex is anchored.
        assert.strictEqual(headingLevel('   # Title'), null);
        assert.strictEqual(headingLevel('#Title'), null);
        assert.strictEqual(headingLevel('text'), null);
    });

    test('a heading with nothing after the hashes is still a heading', () => {
        // `## ` reached the placement rule as a heading and the editing rule
        // as plain text; an entry written under it was then refused an edit.
        assert.strictEqual(headingLevel('## '), 2);

        const match = HEADING_REGEX.exec('## ');
        assert.ok(match, '`## ` must match the canonical pattern');
        assert.strictEqual(match.groups?.hashes, '##');
        assert.strictEqual(match.groups.title, '');
    });

    test('the canonical pattern refuses what the extractor refuses', () => {
        assert.strictEqual(HEADING_REGEX.exec('####### Title'), null);
        assert.strictEqual(HEADING_REGEX.exec('   ## Title'), null);
    });

    test('placement reads the level through the same rule', () => {
        // Seven hashes are not a note to join: the entry goes at the cursor as
        // a top-level heading rather than one level deeper than a non-heading.
        const lines = ['####### Not a heading', 'text'];
        const placement = placeNewEntry(lines, 0, 1);

        assert.strictEqual(placement.hashes, '#');
    });

    test('a section ends where CommonMark says a heading begins', () => {
        // The properties reader asks a different question -- where the block
        // it is reading stops belonging to the heading above it -- and reads
        // the file the way the extractor's markdown parser does.
        assert.ok(isSectionBreak('# Title'));
        assert.ok(isSectionBreak('   ### Title'), 'up to three spaces of indent');
        assert.ok(isSectionBreak('##'), 'hashes with nothing after them');
        assert.ok(!isSectionBreak('####### Title'));
        assert.ok(!isSectionBreak('#Title'));
        assert.ok(!isSectionBreak('    # Title'), 'four spaces is an indented code block');
    });
});
