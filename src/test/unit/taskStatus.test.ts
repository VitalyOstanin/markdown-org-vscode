import * as assert from 'assert';
import { HEADING_REGEX } from '../../orgPatterns';
import { computeToggledStatus } from '../../utils/normalizeTaskType';
import { buildHeading } from '../../utils/buildHeading';

// These tests exercise the real building blocks of the status commands --
// HEADING_REGEX (parsing), computeToggledStatus (the setTaskStatus toggle
// rule) and buildHeading (rendering) -- rather than re-implementing the logic
// locally, so they cannot drift away from production. The command wiring
// itself is covered end-to-end in taskStatus.integration.test.ts.
suite('Task Status Tests', () => {
    test('Parse heading with TODO status', () => {
        const match = '## TODO Task title'.match(HEADING_REGEX);

        assert.ok(match?.groups);
        assert.strictEqual(match.groups.hashes, '##');
        assert.strictEqual(match.groups.status, 'TODO');
        assert.strictEqual(match.groups.priority, undefined);
        assert.strictEqual(match.groups.title, 'Task title');
    });

    test('Parse heading with DONE status', () => {
        const match = '## DONE Task title'.match(HEADING_REGEX);

        assert.ok(match?.groups);
        assert.strictEqual(match.groups.status, 'DONE');
    });

    test('Parse heading with priority', () => {
        const match = '## TODO [#A] High priority task'.match(HEADING_REGEX);

        assert.ok(match?.groups);
        assert.strictEqual(match.groups.status, 'TODO');
        assert.strictEqual(match.groups.priority, 'A');
        assert.strictEqual(match.groups.title, 'High priority task');
    });

    test('Parse heading without status', () => {
        const match = '## Regular heading'.match(HEADING_REGEX);

        assert.ok(match?.groups);
        assert.strictEqual(match.groups.hashes, '##');
        assert.strictEqual(match.groups.status, undefined);
        assert.strictEqual(match.groups.priority, undefined);
        assert.strictEqual(match.groups.title, 'Regular heading');
    });

    test('Parse heading with different priority levels', () => {
        const priorities = ['A', 'B', 'C', 'Z'];

        priorities.forEach((priority) => {
            const match = `## TODO [#${priority}] Task`.match(HEADING_REGEX);

            assert.ok(match?.groups);
            assert.strictEqual(match.groups.priority, priority);
        });
    });

    test('Parse heading with CANCELLED status', () => {
        const match = '### CANCELLED Foo'.match(HEADING_REGEX);

        assert.ok(match?.groups);
        assert.strictEqual(match.groups.hashes, '###');
        assert.strictEqual(match.groups.status, 'CANCELLED');
        assert.strictEqual(match.groups.priority, undefined);
        assert.strictEqual(match.groups.title, 'Foo');
    });

    test('Parse heading with CANCELED (single-L) status', () => {
        const match = '### CANCELED Foo'.match(HEADING_REGEX);

        assert.ok(match?.groups);
        assert.strictEqual(match.groups.status, 'CANCELED');
    });

    test('Build heading with status and priority', () => {
        const result = buildHeading({ hashes: '##', status: 'TODO', priority: 'A', title: 'Task title' });
        assert.strictEqual(result, '## TODO [#A] Task title');
    });

    test('Toggle status TODO to DONE (sets when keyword differs)', () => {
        assert.strictEqual(computeToggledStatus('TODO', 'DONE'), 'DONE');
    });

    test('Toggle status DONE off (clears when keyword matches)', () => {
        assert.strictEqual(computeToggledStatus('DONE', 'DONE'), undefined);
    });

    test('setTaskStatus(CANCELLED) on TODO heading -> CANCELLED', () => {
        assert.strictEqual(computeToggledStatus('TODO', 'CANCELLED'), 'CANCELLED');
    });

    test('Roundtrip TODO -> CANCELLED -> DONE', () => {
        const afterCancelled = computeToggledStatus('TODO', 'CANCELLED');
        assert.strictEqual(afterCancelled, 'CANCELLED');

        const afterDone = computeToggledStatus(afterCancelled, 'DONE');
        assert.strictEqual(afterDone, 'DONE');
    });

    test('Toggle-off: setTaskStatus(CANCELLED) on CANCELLED heading clears it', () => {
        assert.strictEqual(computeToggledStatus('CANCELLED', 'CANCELLED'), undefined);
    });

    test('Cross-spelling toggle-off: CANCELED heading + apply CANCELLED clears it', () => {
        // '### CANCELED Foo' -> apply CANCELLED -> '### Foo' (toggle off, not respell)
        assert.strictEqual(computeToggledStatus('CANCELED', 'CANCELLED'), undefined);
    });

    test('Cross-spelling rule: TODO heading + apply CANCELLED sets CANCELLED', () => {
        assert.strictEqual(computeToggledStatus('TODO', 'CANCELLED'), 'CANCELLED');
    });
});
