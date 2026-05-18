import * as assert from 'assert';
import { suite, test } from 'mocha';
import { extractHeadingBlockLines } from '../../utils/extractHeading';

suite('extractHeadingBlockLines', () => {
    test('returns the heading line itself plus subordinate lines up to the next sibling', () => {
        // Same-level (sibling) heading terminates the block. This is the
        // semantics moveToArchive / promoteToMaintain rely on: a cut at `# A`
        // takes A and everything beneath it, but does not swallow `# B`.
        const lines = ['# A', 'a-body', '## A.1', 'a1-body', '# B', 'b-body'];
        const result = extractHeadingBlockLines(lines, 0, 1);
        assert.deepStrictEqual(result, ['# A', 'a-body', '## A.1', 'a1-body']);
    });

    test('terminates at a higher-level ancestor heading too', () => {
        // From inside `## inner`, a `# parent` must terminate the block --
        // ancestors are "<= level".
        const lines = ['## inner', 'inner-body', '# parent', 'parent-body'];
        const result = extractHeadingBlockLines(lines, 0, 2);
        assert.deepStrictEqual(result, ['## inner', 'inner-body']);
    });

    test('includes everything up to EOF when no sibling/ancestor heading follows', () => {
        const lines = ['# A', 'a', 'b', 'c'];
        const result = extractHeadingBlockLines(lines, 0, 1);
        assert.deepStrictEqual(result, ['# A', 'a', 'b', 'c']);
    });

    test('does not stop on deeper subheadings -- they are part of the block', () => {
        const lines = ['# A', '## A.1', '### A.1.1', '## A.2', '# B'];
        const result = extractHeadingBlockLines(lines, 0, 1);
        assert.deepStrictEqual(result, ['# A', '## A.1', '### A.1.1', '## A.2']);
    });

    test('returns the heading line alone when the next line is a sibling heading', () => {
        const lines = ['# A', '# B'];
        const result = extractHeadingBlockLines(lines, 0, 1);
        assert.deepStrictEqual(result, ['# A']);
    });

    test('startLine > 0 is allowed -- block extraction starts from any heading', () => {
        // Real callers pass the heading-line index returned by
        // findNearestHeading; that is rarely 0.
        const lines = ['# A', 'a-body', '## A.1', 'a1-body', '## A.2', 'a2-body'];
        const result = extractHeadingBlockLines(lines, 2, 2);
        assert.deepStrictEqual(result, ['## A.1', 'a1-body']);
    });
});
