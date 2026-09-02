import * as assert from 'node:assert/strict';
import {
    buildOrgPropertiesBlock,
    findOrgPropertiesBlock,
    findOrgPropertiesBlocks,
    upsertOrgProperties,
    computeOrgPropertiesEdit
} from '../../utils/orgProperties';

suite('orgProperties.buildOrgPropertiesBlock', () => {
    test('wraps sorted key/value pairs in an org-properties fence', () => {
        const lines = buildOrgPropertiesBlock({ B: '2', A: '1' });
        assert.deepEqual(lines, ['```org-properties', 'A: 1', 'B: 2', '```']);
    });

    test('applies the given indent to every line', () => {
        const lines = buildOrgPropertiesBlock({ K: 'v' }, '  ');
        assert.deepEqual(lines, ['  ```org-properties', '  K: v', '  ```']);
    });

    test('keeps an empty value', () => {
        const lines = buildOrgPropertiesBlock({ K: '' });
        assert.deepEqual(lines, ['```org-properties', 'K:', '```']);
    });
});

suite('orgProperties.findOrgPropertiesBlock', () => {
    test('returns null when no block follows the heading', () => {
        const lines = ['### TODO T', '`SCHEDULED: <2026-06-01 Mon>`', '', 'Body.'];
        assert.equal(findOrgPropertiesBlock(lines, 0), null);
    });

    test('locates a block placed right after the planning lines', () => {
        const lines = ['### TODO T', '`SCHEDULED: <2026-06-01 Mon>`', '```org-properties', 'K: v', '```', '', 'Body.'];
        assert.deepEqual(findOrgPropertiesBlock(lines, 0), { startLine: 2, endLineExclusive: 5 });
    });

    test('locates a block placed directly under the heading (no planning lines)', () => {
        const lines = ['### TODO T', '```org-properties', 'K: v', '```'];
        assert.deepEqual(findOrgPropertiesBlock(lines, 0), { startLine: 1, endLineExclusive: 4 });
    });

    test('returns null for an unterminated block (no closing fence)', () => {
        const lines = ['### TODO T', '```org-properties', 'K: v'];
        assert.equal(findOrgPropertiesBlock(lines, 0), null);
    });

    // The three clients have to agree on where a block is. The extractor
    // reads every `org-properties` block of the heading's section, whatever
    // fences it, and the last one wins on a repeated key; the phone writes to
    // the last one too. Everything below is a file that reads as one block to
    // them and read as none here, so this side inserted a second block above
    // the first -- and the value it had just written was shadowed by the old
    // one the moment the extractor read the file back.
    test('finds a block further down the body, not only after the planning lines', () => {
        const lines = [
            '### TODO T',
            '`SCHEDULED: <2026-06-01 Mon>`',
            '',
            'Body.',
            '',
            '```org-properties',
            'K: v',
            '```'
        ];
        assert.deepEqual(findOrgPropertiesBlock(lines, 0), { startLine: 5, endLineExclusive: 8 });
    });

    test('accepts a tilde fence and a fence longer than three characters', () => {
        const tildes = ['### TODO T', '~~~org-properties', 'K: v', '~~~'];
        assert.deepEqual(findOrgPropertiesBlock(tildes, 0), { startLine: 1, endLineExclusive: 4 });

        const long = ['### TODO T', '````org-properties', 'K: v', '````'];
        assert.deepEqual(findOrgPropertiesBlock(long, 0), { startLine: 1, endLineExclusive: 4 });
    });

    test('answers with the last block of the section, which is the one that wins', () => {
        const lines = [
            '### TODO T',
            '```org-properties',
            'K: old',
            '```',
            'Body.',
            '```org-properties',
            'K: new',
            '```'
        ];
        assert.deepEqual(findOrgPropertiesBlocks(lines, 0), [
            { startLine: 1, endLineExclusive: 4 },
            { startLine: 5, endLineExclusive: 8 }
        ]);
        assert.deepEqual(findOrgPropertiesBlock(lines, 0), { startLine: 5, endLineExclusive: 8 });
    });

    test('stops at the next heading: a block of the following entry is not this one', () => {
        const lines = ['### TODO T', 'Body.', '## Another heading', '```org-properties', 'K: v', '```'];
        assert.deepEqual(findOrgPropertiesBlocks(lines, 0), []);
    });

    test('a heading inside a fenced block does not end the section', () => {
        const lines = ['### TODO T', '```markdown', '## Not a heading here', '```', '```org-properties', 'K: v', '```'];
        assert.deepEqual(findOrgPropertiesBlock(lines, 0), { startLine: 4, endLineExclusive: 7 });
    });

    test('a backtick fence carrying a backtick in its info string opens nothing', () => {
        // CommonMark forbids it, so the line is ordinary text -- a sentence
        // about `code`, say. Reading it as a fence would swallow the block
        // below it and lose the properties of the entry.
        const lines = ['### TODO T', '```markdown `x`', '```org-properties', 'K: v', '```'];
        assert.deepEqual(findOrgPropertiesBlock(lines, 0), { startLine: 2, endLineExclusive: 5 });
    });

    test('an org-properties fence inside a wider fence is not a block of its own', () => {
        const lines = ['### TODO T', '````markdown', '```org-properties', 'K: v', '```', '````'];
        assert.deepEqual(findOrgPropertiesBlocks(lines, 0), []);
    });
});

suite('orgProperties.upsertOrgProperties', () => {
    test('inserts a block after the planning lines when none exists', () => {
        const lines = ['### TODO T', '`SCHEDULED: <2026-06-01 Mon>`', '', 'Body.'];
        const result = upsertOrgProperties(lines, 0, { GCAL_EVENT_ID: 'abc/primary' });
        assert.deepEqual(result, [
            '### TODO T',
            '`SCHEDULED: <2026-06-01 Mon>`',
            '```org-properties',
            'GCAL_EVENT_ID: abc/primary',
            '```',
            '',
            'Body.'
        ]);
    });

    test('inserts directly under the heading when there are no planning lines', () => {
        const lines = ['### TODO T', 'Body.'];
        const result = upsertOrgProperties(lines, 0, { K: 'v' });
        assert.deepEqual(result, ['### TODO T', '```org-properties', 'K: v', '```', 'Body.']);
    });

    test('replaces an existing block in place', () => {
        const lines = [
            '### TODO T',
            '`SCHEDULED: <2026-06-01 Mon>`',
            '```org-properties',
            'GCAL_EVENT_ID: old',
            '```',
            'Body.'
        ];
        const result = upsertOrgProperties(lines, 0, { GCAL_EVENT_ID: 'new', ID: 'uuid' });
        assert.deepEqual(result, [
            '### TODO T',
            '`SCHEDULED: <2026-06-01 Mon>`',
            '```org-properties',
            'GCAL_EVENT_ID: new',
            'ID: uuid',
            '```',
            'Body.'
        ]);
    });

    test('is idempotent: applying the same props twice yields the same lines', () => {
        const lines = ['### TODO T', '`SCHEDULED: <2026-06-01 Mon>`', 'Body.'];
        const once = upsertOrgProperties(lines, 0, { K: 'v' });
        const twice = upsertOrgProperties(once, 0, { K: 'v' });
        assert.deepEqual(twice, once);
    });

    test('preserves the indent of the planning lines', () => {
        const lines = ['  ### TODO T', '  `SCHEDULED: <2026-06-01 Mon>`', '  Body.'];
        const result = upsertOrgProperties(lines, 0, { K: 'v' });
        assert.deepEqual(result, [
            '  ### TODO T',
            '  `SCHEDULED: <2026-06-01 Mon>`',
            '  ```org-properties',
            '  K: v',
            '  ```',
            '  Body.'
        ]);
    });
});

suite('orgProperties.computeOrgPropertiesEdit', () => {
    test('insert: empty range (startLine === endLineExclusive) after the planning run', () => {
        const lines = ['### TODO Foo', '`SCHEDULED: <2026-06-01 Mon>`', 'Body.'];
        const e = computeOrgPropertiesEdit(lines, 0, { ID: 'x' });
        assert.equal(e.startLine, 2);
        assert.equal(e.endLineExclusive, 2);
        assert.deepEqual(e.blockLines, ['```org-properties', 'ID: x', '```']);
    });

    test('insert at EOF: heading with no body — range points past the last line', () => {
        const lines = ['### TODO Foo'];
        const e = computeOrgPropertiesEdit(lines, 0, { ID: 'x' });
        assert.equal(e.startLine, 1);
        assert.equal(e.endLineExclusive, 1);
    });

    test('replace: existing block range is returned', () => {
        const lines = ['### TODO Foo', '```org-properties', 'ID: old', '```', 'Body.'];
        const e = computeOrgPropertiesEdit(lines, 0, { ID: 'new' });
        assert.equal(e.startLine, 1);
        assert.equal(e.endLineExclusive, 4);
        assert.deepEqual(e.blockLines, ['```org-properties', 'ID: new', '```']);
    });
});
