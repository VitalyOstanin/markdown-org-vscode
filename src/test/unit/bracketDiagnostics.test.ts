import * as assert from 'assert';
import { validateLines } from '../../diagnostics/bracketPolicy';

suite('validateLines (ADR-0014 bracket policy)', () => {
    test('canonical SCHEDULED with `<...>` produces no violations', () => {
        assert.deepStrictEqual(validateLines(['## TODO Task', '`SCHEDULED: <2025-12-06 Fri>`']), []);
    });

    test('canonical DEADLINE with `<...>` produces no violations', () => {
        assert.deepStrictEqual(validateLines(['`DEADLINE: <2025-12-06 Fri>`']), []);
    });

    test('canonical CLOSED with `[...]` produces no violations', () => {
        assert.deepStrictEqual(validateLines(['`CLOSED: [2025-12-06 Fri]`']), []);
    });

    test('canonical CREATED with `[...]` produces no violations', () => {
        assert.deepStrictEqual(validateLines(['`CREATED: [2025-12-01 Mon]`']), []);
    });

    test('SCHEDULED with inactive bracket is flagged with policy-mismatch', () => {
        const violations = validateLines(['`SCHEDULED: [2025-12-06 Fri]`']);
        assert.strictEqual(violations.length, 1);
        const v = violations[0];
        assert.strictEqual(v.kind, 'policy-mismatch');
        assert.strictEqual(v.keyword, 'SCHEDULED');
        assert.strictEqual(v.requiredPolicy, 'active');
        assert.strictEqual(v.requiredOpen, '<');
        assert.strictEqual(v.requiredClose, '>');
        assert.strictEqual(v.actualOpen, '[');
        assert.strictEqual(v.actualClose, ']');
        assert.match(v.message, /SCHEDULED requires active bracket form/);
    });

    test('CLOSED with active bracket (legacy form) is flagged', () => {
        const violations = validateLines(['`CLOSED: <2025-12-03 Tue 14:30>`']);
        assert.strictEqual(violations.length, 1);
        assert.strictEqual(violations[0].kind, 'policy-mismatch');
        assert.strictEqual(violations[0].keyword, 'CLOSED');
        assert.strictEqual(violations[0].requiredPolicy, 'inactive');
        assert.match(violations[0].message, /CLOSED requires inactive bracket form/);
    });

    test('CREATED with active bracket is flagged', () => {
        const violations = validateLines(['`CREATED: <2025-12-01 Mon>`']);
        assert.strictEqual(violations.length, 1);
        assert.strictEqual(violations[0].keyword, 'CREATED');
        assert.strictEqual(violations[0].requiredPolicy, 'inactive');
    });

    test('mixed pair `<...]` is flagged as mixed-pair (not policy-mismatch)', () => {
        const violations = validateLines(['`SCHEDULED: <2025-12-06 Fri]`']);
        assert.strictEqual(violations.length, 1);
        assert.strictEqual(violations[0].kind, 'mixed-pair');
        assert.strictEqual(violations[0].actualOpen, '<');
        assert.strictEqual(violations[0].actualClose, ']');
        assert.match(violations[0].message, /Mixed bracket pair "<\.\.\.\]"/);
    });

    test('mixed pair `[...>` is also flagged', () => {
        const violations = validateLines(['`CREATED: [2025-12-01 Mon>`']);
        assert.strictEqual(violations.length, 1);
        assert.strictEqual(violations[0].kind, 'mixed-pair');
        assert.strictEqual(violations[0].actualOpen, '[');
        assert.strictEqual(violations[0].actualClose, '>');
    });

    test('violation range covers the entire timestamp', () => {
        const line = '`SCHEDULED: [2025-12-06 Fri]`';
        const violations = validateLines([line]);
        assert.strictEqual(violations.length, 1);
        const v = violations[0];
        assert.strictEqual(v.line, 0);
        assert.strictEqual(v.startCharacter, line.indexOf('['));
        assert.strictEqual(v.endCharacter, line.indexOf(']') + 1);
    });

    test('several violations on different lines are all reported', () => {
        const violations = validateLines([
            '`SCHEDULED: <2025-12-06 Fri>`', // OK
            '`CLOSED: <2025-12-07 Sat>`', // legacy
            '`CREATED: <2025-12-08 Sun>`', // legacy
            '`DEADLINE: [2025-12-09 Mon]`' // wrong policy
        ]);
        assert.strictEqual(violations.length, 3);
        assert.deepStrictEqual(
            violations.map((v) => v.keyword),
            ['CLOSED', 'CREATED', 'DEADLINE']
        );
    });

    test('inline timestamps (no keyword) are not validated by this rule', () => {
        // Inline `<...>` and `[...]` are both allowed by ADR-0014.
        assert.deepStrictEqual(
            validateLines(['Reference [2025-12-06 Fri 14:30] in prose', 'See <2025-12-06 Fri> ahead']),
            []
        );
    });

    test('non-timestamp lines are ignored', () => {
        assert.deepStrictEqual(
            validateLines(['## TODO Task title', 'Just some narrative.', '```js', 'const x = 1;', '```']),
            []
        );
    });

    test('indented keyword line is still validated', () => {
        const violations = validateLines(['    `CLOSED: <2025-12-06 Fri>`']);
        assert.strictEqual(violations.length, 1);
        assert.strictEqual(violations[0].keyword, 'CLOSED');
        // The range starts at the opening bracket, not at the line start.
        assert.strictEqual(violations[0].startCharacter, '    `CLOSED: '.length);
    });
});
