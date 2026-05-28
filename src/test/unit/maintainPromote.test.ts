import * as assert from 'assert';
import { suite, test } from 'mocha';
import { computeMaintainInsertion, type PromoteBlock } from '../../utils/maintainPromote';

/**
 * `computeMaintainInsertion` is the pure brain of the **Promote to Maintain**
 * command. It moves a heading block out of one document into the maintain
 * file's `# incoming` section, normalising the heading to `## ` and
 * re-levelling the child headings underneath it. The cases below pin the
 * three branches users hit when migrating from an older planner:
 *
 *   1. The maintain file already has an `# incoming` section -> splice the
 *      block right after it.
 *   2. The maintain file exists but has no `# incoming` -> append one at
 *      the bottom with the block under it.
 *   3. The maintain file is brand new (empty content) -> write the section
 *      from scratch.
 *
 * Plus the re-levelling math and the `# incoming` case-insensitive match.
 */
suite('computeMaintainInsertion: append under a freshly created `# incoming`', () => {
    test('empty maintain content -> writes `# incoming` + the block', () => {
        const block: PromoteBlock = {
            headingText: 'Migrate ticket #42',
            headingLevel: 2,
            bodyLines: ['Some notes', '- a bullet']
        };
        const out = computeMaintainInsertion('', block);
        assert.strictEqual(out, '# incoming\n## Migrate ticket #42\nSome notes\n- a bullet\n');
    });

    test('non-empty content not ending with `\\n\\n` -> a `\\n\\n` separator is added', () => {
        // Existing content ends with a single `\n`. The separator is
        // appended verbatim, which leaves three `\n` in a row at the seam
        // (the original `\n` plus the `\n\n` separator). This is the
        // pre-refactor behaviour; the surrounding command writes the result
        // back without further normalisation, and downstream markdown
        // renderers collapse the extra blank line.
        const existing = '# Triaged\n\n## Old item\nbody\n';
        const block: PromoteBlock = {
            headingText: 'New thing',
            headingLevel: 2,
            bodyLines: []
        };
        const out = computeMaintainInsertion(existing, block);
        assert.strictEqual(out, '# Triaged\n\n## Old item\nbody\n\n\n# incoming\n## New thing\n\n');
    });

    test('content that already ends with a hard blank line -> no extra separator', () => {
        const existing = '# Triaged\n\n';
        const block: PromoteBlock = {
            headingText: 'X',
            headingLevel: 2,
            bodyLines: []
        };
        const out = computeMaintainInsertion(existing, block);
        assert.strictEqual(out, '# Triaged\n\n# incoming\n## X\n\n');
    });
});

suite('computeMaintainInsertion: splice under an existing `# incoming`', () => {
    test('block lands right after the `# incoming` line, with a trailing blank', () => {
        const existing = '# incoming\n## Pre-existing\nold body\n';
        const block: PromoteBlock = {
            headingText: 'Fresh',
            headingLevel: 2,
            bodyLines: ['line one', 'line two']
        };
        const out = computeMaintainInsertion(existing, block);
        // The new block goes directly after `# incoming`, before the old item,
        // followed by an empty separator line. Splicing into the array means
        // the existing trailing `\n` is preserved by the join.
        assert.strictEqual(out, '# incoming\n## Fresh\nline one\nline two\n\n## Pre-existing\nold body\n');
    });

    test('`# incoming` match is case-insensitive (#42 INCOMING / # Incoming both work)', () => {
        for (const variant of ['# INCOMING', '# Incoming', '# incoming']) {
            const existing = `${variant}\n## old\n`;
            const out = computeMaintainInsertion(existing, {
                headingText: 'fresh',
                headingLevel: 2,
                bodyLines: []
            });
            assert.ok(
                out.startsWith(`${variant}\n## fresh\n\n## old\n`),
                `case-insensitive match failed for ${JSON.stringify(variant)}: got ${JSON.stringify(out)}`
            );
        }
    });

    test('only the first `# incoming` is targeted when several appear', () => {
        const existing = '# incoming\nfirst\n# incoming\nsecond\n';
        const out = computeMaintainInsertion(existing, {
            headingText: 'X',
            headingLevel: 2,
            bodyLines: []
        });
        // The block goes after the FIRST `# incoming`, the second header is
        // left untouched -- splice index is the first match, the rest of
        // the lines are shifted down by two.
        assert.strictEqual(out, '# incoming\n## X\n\nfirst\n# incoming\nsecond\n');
    });
});

suite('computeMaintainInsertion: heading re-levelling math', () => {
    test('source heading is rewritten as `## ` regardless of its original level', () => {
        for (const level of [1, 2, 3, 4, 5, 6]) {
            const out = computeMaintainInsertion('', {
                headingText: `H${level}`,
                headingLevel: level,
                bodyLines: []
            });
            assert.ok(
                out.includes(`## H${level}`),
                `expected '## H${level}' in output for headingLevel=${level}: ${out}`
            );
        }
    });

    test('child headings shift by `delta = 2 - sourceLevel` (e.g. ### child of ## stays ###)', () => {
        // Promoted heading is level 2. delta = 0. Children keep their level.
        const out = computeMaintainInsertion('', {
            headingText: 'Root',
            headingLevel: 2,
            bodyLines: ['### Child', '#### Grandchild', 'body line']
        });
        assert.ok(out.includes('### Child'), `child kept ###: ${out}`);
        assert.ok(out.includes('#### Grandchild'), `grandchild kept ####: ${out}`);
    });

    test('promoting a level-1 heading raises children by one (H2 child becomes H3)', () => {
        // Promoted heading is level 1. delta = 1. Children shift up one
        // level (numerically deeper).
        const out = computeMaintainInsertion('', {
            headingText: 'Root',
            headingLevel: 1,
            bodyLines: ['## Child', '### Grandchild']
        });
        assert.ok(out.includes('### Child'), `## child became ### under delta=1: ${out}`);
        assert.ok(out.includes('#### Grandchild'), `### grandchild became ####: ${out}`);
    });

    test('promoting a level-4 heading lifts children by two (H6 child becomes H4)', () => {
        // Promoted heading is level 4. delta = -2. Children shift up two.
        const out = computeMaintainInsertion('', {
            headingText: 'Deep',
            headingLevel: 4,
            bodyLines: ['##### A', '###### B']
        });
        assert.ok(out.includes('### A'), `##### became ###: ${out}`);
        assert.ok(out.includes('#### B'), `###### became ####: ${out}`);
    });

    test('child heading levels are clamped into `[1, 6]` so neither end overflows', () => {
        // delta = +1, an already-level-6 child would land at 7. Clamp to 6.
        const high = computeMaintainInsertion('', {
            headingText: 'Root',
            headingLevel: 1,
            bodyLines: ['###### Deepest']
        });
        assert.ok(high.includes('###### Deepest'), `level-6 clamped to 6: ${high}`);

        // delta = -5, a level-1 child would land at -4. Clamp to 1.
        const low = computeMaintainInsertion('', {
            headingText: 'Deep',
            headingLevel: 6,
            bodyLines: ['# Topmost']
        });
        assert.ok(low.includes('# Topmost'), `level-1 clamped to 1: ${low}`);
    });

    test('non-heading body lines pass through untouched (no false `#` matches)', () => {
        const out = computeMaintainInsertion('', {
            headingText: 'Root',
            headingLevel: 2,
            bodyLines: [
                '`SCHEDULED: <2026-06-01>`',
                'A paragraph mentioning #hashtag and #1 and `# echo`.',
                '- bullet with # in it',
                ''
            ]
        });
        // Quoted backtick lines, paragraphs, and bullets must come back as-is.
        assert.ok(out.includes('`SCHEDULED: <2026-06-01>`'));
        assert.ok(out.includes('A paragraph mentioning #hashtag and #1 and `# echo`.'));
        assert.ok(out.includes('- bullet with # in it'));
    });
});
