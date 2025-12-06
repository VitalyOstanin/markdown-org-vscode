import * as assert from 'assert';

suite('Timestamp Tests', () => {
    const TIMESTAMP_REGEX = /<(\d{4})-(\d{2})-(\d{2})(?: ([А-Яа-яA-Za-z]{2,3}))?(?: (\d{2}):(\d{2}))?(?: (\+\d+[dwmy]{1,2}))?>/;
    const TIMESTAMP_LINE_REGEX = /^(\s*)`(CREATED|SCHEDULED|DEADLINE|CLOSED): (<[^>]+>)`$/;

    test('Parse timestamp with date only', () => {
        const timestamp = '<2025-12-06 Fri>';
        const match = timestamp.match(TIMESTAMP_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[1], '2025');
        assert.strictEqual(match[2], '12');
        assert.strictEqual(match[3], '06');
        assert.strictEqual(match[4], 'Fri');
        assert.strictEqual(match[5], undefined);
        assert.strictEqual(match[6], undefined);
    });

    test('Parse timestamp with date and time', () => {
        const timestamp = '<2025-12-06 Fri 14:30>';
        const match = timestamp.match(TIMESTAMP_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[1], '2025');
        assert.strictEqual(match[2], '12');
        assert.strictEqual(match[3], '06');
        assert.strictEqual(match[4], 'Fri');
        assert.strictEqual(match[5], '14');
        assert.strictEqual(match[6], '30');
    });

    test('Parse timestamp with repeater', () => {
        const timestamp = '<2025-12-06 Fri 10:00 +1d>';
        const match = timestamp.match(TIMESTAMP_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[7], '+1d');
    });

    test('Parse timestamp with workday repeater', () => {
        const timestamp = '<2025-12-06 Fri +2wd>';
        const match = timestamp.match(TIMESTAMP_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[7], '+2wd');
    });

    test('Parse SCHEDULED timestamp line', () => {
        const line = '`SCHEDULED: <2025-12-06 Fri 10:00>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[1], '');
        assert.strictEqual(match[2], 'SCHEDULED');
        assert.strictEqual(match[3], '<2025-12-06 Fri 10:00>');
    });

    test('Parse DEADLINE timestamp line', () => {
        const line = '`DEADLINE: <2025-12-06 Fri>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[2], 'DEADLINE');
    });

    test('Parse CREATED timestamp line', () => {
        const line = '`CREATED: <2025-12-01 Sun 09:15>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[2], 'CREATED');
    });

    test('Parse CLOSED timestamp line', () => {
        const line = '`CLOSED: <2025-12-03 Tue 14:30>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[2], 'CLOSED');
    });

    test('Parse timestamp line with indent', () => {
        const line = '  `SCHEDULED: <2025-12-06 Fri>`';
        const match = line.match(TIMESTAMP_LINE_REGEX);
        
        assert.ok(match);
        assert.strictEqual(match[1], '  ');
        assert.strictEqual(match[2], 'SCHEDULED');
    });

    test('Toggle timestamp type SCHEDULED to DEADLINE', () => {
        const types = ['SCHEDULED', 'DEADLINE', 'CLOSED'];
        const currentIndex = types.indexOf('SCHEDULED');
        const newIndex = (currentIndex + 1) % types.length;
        
        assert.strictEqual(types[newIndex], 'DEADLINE');
    });

    test('Toggle timestamp type DEADLINE to CLOSED', () => {
        const types = ['SCHEDULED', 'DEADLINE', 'CLOSED'];
        const currentIndex = types.indexOf('DEADLINE');
        const newIndex = (currentIndex + 1) % types.length;
        
        assert.strictEqual(types[newIndex], 'CLOSED');
    });

    test('Toggle timestamp type CLOSED to SCHEDULED', () => {
        const types = ['SCHEDULED', 'DEADLINE', 'CLOSED'];
        const currentIndex = types.indexOf('CLOSED');
        const newIndex = (currentIndex + 1) % types.length;
        
        assert.strictEqual(types[newIndex], 'SCHEDULED');
    });

    test('Increment day', () => {
        const date = new Date('2025-12-06');
        date.setDate(date.getDate() + 1);
        
        assert.strictEqual(date.getDate(), 7);
        assert.strictEqual(date.getMonth(), 11); // December
    });

    test('Decrement day', () => {
        const date = new Date('2025-12-06');
        date.setDate(date.getDate() - 1);
        
        assert.strictEqual(date.getDate(), 5);
    });

    test('Increment month', () => {
        const date = new Date('2025-12-06');
        date.setMonth(date.getMonth() + 1);
        
        assert.strictEqual(date.getMonth(), 0); // January
        assert.strictEqual(date.getFullYear(), 2026);
    });

    test('Increment hour', () => {
        const date = new Date('2025-12-06T14:30:00');
        date.setHours(date.getHours() + 1);
        
        assert.strictEqual(date.getHours(), 15);
    });

    test('Increment minute', () => {
        const date = new Date('2025-12-06T14:30:00');
        date.setMinutes(date.getMinutes() + 1);
        
        assert.strictEqual(date.getMinutes(), 31);
    });
});
