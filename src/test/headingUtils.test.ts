import * as assert from 'assert';
import { HEADING_REGEX } from '../orgPatterns';

suite('Heading Utils Tests', () => {
    test('Detect heading level 1', () => {
        const heading = '# Title';
        const match = heading.match(HEADING_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.hashes.length, 1);
    });

    test('Detect heading level 2', () => {
        const heading = '## Title';
        const match = heading.match(HEADING_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.hashes.length, 2);
    });

    test('Detect heading level 3', () => {
        const heading = '### Title';
        const match = heading.match(HEADING_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.hashes.length, 3);
    });

    test('Extract title from heading', () => {
        const heading = '## TODO [#A] Task title';
        const match = heading.match(HEADING_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.title, 'Task title');
    });

    test('Extract title from simple heading', () => {
        const heading = '## Simple title';
        const match = heading.match(HEADING_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.title, 'Simple title');
    });

    test('Heading with special characters in title', () => {
        const heading = '## TODO Task with: special, characters!';
        const match = heading.match(HEADING_REGEX);

        assert.ok(match);
        assert.strictEqual(match.groups?.title, 'Task with: special, characters!');
    });

    test('Not a heading - missing hash', () => {
        const text = 'TODO Task title';
        const match = text.match(HEADING_REGEX);

        assert.strictEqual(match, null);
    });

    test('Not a heading - no space after hash', () => {
        const text = '##TODO Task title';
        const match = text.match(HEADING_REGEX);

        assert.strictEqual(match, null);
    });

    test('Priority cycle A to Z', () => {
        const priorities = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        for (let i = 0; i < priorities.length - 1; i++) {
            const current = priorities.charCodeAt(i);
            const next = current + 1;

            assert.strictEqual(String.fromCharCode(next), priorities[i + 1]);
        }
    });

    test('Priority bounds check', () => {
        const A_CODE = 'A'.charCodeAt(0);
        const Z_CODE = 'Z'.charCodeAt(0);

        assert.strictEqual(A_CODE, 65);
        assert.strictEqual(Z_CODE, 90);

        // Test wrapping
        const afterZ = Z_CODE + 1;
        const wrapped = afterZ > Z_CODE ? A_CODE : afterZ;
        assert.strictEqual(wrapped, A_CODE);
    });
});
