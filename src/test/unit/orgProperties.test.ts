import * as assert from 'node:assert/strict';
import { buildOrgPropertiesBlock } from '../../utils/orgProperties';

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
