import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { timestampedLine } from '../../utils/logLine';

suite('timestampedLine', () => {
    test('prefixes the message with the local time in brackets', () => {
        const line = timestampedLine('x', new Date(2026, 6, 25, 21, 30, 5));
        assert.match(line, /^\[\d{1,2}:\d{2}:\d{2}[^\]]*\] x$/);
    });

    test('keeps the message verbatim, brackets and all', () => {
        const line = timestampedLine('sync (onSave) failed: [boom]', new Date(2026, 6, 25, 9, 5, 0));
        assert.ok(line.endsWith('] sync (onSave) failed: [boom]'), line);
    });

    test('defaults to now when no clock is supplied', () => {
        assert.match(timestampedLine('now'), /^\[\d{1,2}:\d{2}:\d{2}[^\]]*\] now$/);
    });
});
