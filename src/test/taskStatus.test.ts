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
        
        priorities.forEach(priority => {
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
});
