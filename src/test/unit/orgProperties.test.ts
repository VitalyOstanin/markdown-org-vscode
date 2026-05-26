import * as assert from 'node:assert/strict';
import { buildOrgPropertiesBlock, findOrgPropertiesBlock } from '../../utils/orgProperties';

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
});
