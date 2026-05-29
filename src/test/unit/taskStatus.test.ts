import * as assert from 'assert';

suite('Task Status Tests', () => {
    test('Parse heading with TODO status', () => {
        const heading = '## TODO Task title';
        const match = heading.match(/^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);

        assert.ok(match);
        assert.strictEqual(match[1], '##');
        assert.strictEqual(match[2], 'TODO');
        assert.strictEqual(match[3], undefined);
        assert.strictEqual(match[4], 'Task title');
    });

    test('Parse heading with DONE status', () => {
        const heading = '## DONE Task title';
        const match = heading.match(/^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);

        assert.ok(match);
        assert.strictEqual(match[2], 'DONE');
    });

    test('Parse heading with priority', () => {
        const heading = '## TODO [#A] High priority task';
        const match = heading.match(/^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);

        assert.ok(match);
        assert.strictEqual(match[2], 'TODO');
        assert.strictEqual(match[3], 'A');
        assert.strictEqual(match[4], 'High priority task');
    });

    test('Parse heading without status', () => {
        const heading = '## Regular heading';
        const match = heading.match(/^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);

        assert.ok(match);
        assert.strictEqual(match[1], '##');
        assert.strictEqual(match[2], undefined);
        assert.strictEqual(match[3], undefined);
        assert.strictEqual(match[4], 'Regular heading');
    });

    test('Parse heading with different priority levels', () => {
        const priorities = ['A', 'B', 'C', 'Z'];

        priorities.forEach((priority) => {
            const heading = `## TODO [#${priority}] Task`;
            const match = heading.match(/^(#+)\s+(?:(TODO|DONE)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);

            assert.ok(match);
            assert.strictEqual(match[3], priority);
        });
    });

    test('Build heading with status and priority', () => {
        const hashes = '##';
        const status = 'TODO';
        const priority = 'A';
        const title = 'Task title';

        const result = `${hashes} ${status} [#${priority}] ${title}`;
        assert.strictEqual(result, '## TODO [#A] Task title');
    });

    test('Toggle status TODO to DONE', () => {
        const statuses = ['TODO', 'DONE'];
        const currentIndex = statuses.indexOf('TODO');
        const newIndex = (currentIndex + 1) % statuses.length;

        assert.strictEqual(statuses[newIndex], 'DONE');
    });

    test('Toggle status DONE to TODO', () => {
        const statuses = ['TODO', 'DONE'];
        const currentIndex = statuses.indexOf('DONE');
        const newIndex = (currentIndex + 1) % statuses.length;

        assert.strictEqual(statuses[newIndex], 'TODO');
    });

    test('Parse heading with CANCELLED status', () => {
        const heading = '### CANCELLED Foo';
        const match = heading.match(/^(#+)\s+(?:(TODO|DONE|CANCELLED)\s+)?(?:\[#([A-Z])\]\s+)?(.+)$/);

        assert.ok(match);
        assert.strictEqual(match[1], '###');
        assert.strictEqual(match[2], 'CANCELLED');
        assert.strictEqual(match[3], undefined);
        assert.strictEqual(match[4], 'Foo');
    });

    // Mirrors the toggle rule used by setTaskStatus:
    // `currentStatus !== status ? status : undefined`.
    function nextStatus(current: string | undefined, applied: string): string | undefined {
        return current !== applied ? applied : undefined;
    }

    test('setTaskStatus(CANCELLED) on TODO heading -> CANCELLED', () => {
        // '### TODO Foo' -> apply CANCELLED -> '### CANCELLED Foo'
        assert.strictEqual(nextStatus('TODO', 'CANCELLED'), 'CANCELLED');
    });

    test('Roundtrip TODO -> CANCELLED -> DONE', () => {
        // Start with TODO, switch to CANCELLED.
        const afterCancelled = nextStatus('TODO', 'CANCELLED');
        assert.strictEqual(afterCancelled, 'CANCELLED');

        // From CANCELLED, switch to DONE.
        const afterDone = nextStatus(afterCancelled, 'DONE');
        assert.strictEqual(afterDone, 'DONE');
    });

    test('Toggle-off: setTaskStatus(CANCELLED) on CANCELLED heading clears it', () => {
        // '### CANCELLED Foo' -> apply CANCELLED again -> '### Foo'
        assert.strictEqual(nextStatus('CANCELLED', 'CANCELLED'), undefined);
    });

    // Mirrors the cross-spelling toggle rule used by setTaskStatus: the two
    // cancelled spellings are the same logical status, so re-applying either
    // one clears an existing cancelled heading regardless of its spelling.
    function isCancelled(s: string | undefined): boolean {
        return s === 'CANCELLED' || s === 'CANCELED';
    }
    function nextStatusCrossSpelling(current: string | undefined, applied: string): string | undefined {
        const clearing = current === applied || (isCancelled(current) && isCancelled(applied));
        return clearing ? undefined : applied;
    }

    test('Cross-spelling toggle-off: CANCELED heading + apply CANCELLED clears it', () => {
        // '### CANCELED Foo' -> apply CANCELLED -> '### Foo' (toggle off, not respell)
        assert.strictEqual(nextStatusCrossSpelling('CANCELED', 'CANCELLED'), undefined);
    });

    test('Toggle-off: CANCELLED heading + apply CANCELLED clears it', () => {
        assert.strictEqual(nextStatusCrossSpelling('CANCELLED', 'CANCELLED'), undefined);
    });

    test('Cross-spelling rule: TODO heading + apply CANCELLED sets CANCELLED', () => {
        assert.strictEqual(nextStatusCrossSpelling('TODO', 'CANCELLED'), 'CANCELLED');
    });
});
