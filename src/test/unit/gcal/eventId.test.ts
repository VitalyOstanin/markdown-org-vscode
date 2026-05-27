import * as assert from 'node:assert/strict';
import { taskIdToEventId, isValidEventId } from '../../../utils/gcal/eventId';

suite('gcal/eventId', () => {
    test('derives a base32hex id from a UUID (dashes removed, lowercased)', () => {
        const id = taskIdToEventId('11111111-2222-3333-4444-555555555555');
        assert.equal(id, '11111111222233334444555555555555');
        assert.ok(isValidEventId(id));
    });

    test('lowercases hex from an uppercase UUID', () => {
        assert.equal(taskIdToEventId('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'), 'aaaaaaaabbbbccccddddeeeeeeeeeeee');
    });

    test('isValidEventId accepts base32hex 5..1024, rejects others', () => {
        assert.ok(isValidEventId('abcv0123'));
        assert.ok(!isValidEventId('abcz')); // too short + 'z' out of 0-9a-v
        assert.ok(!isValidEventId('ABCDE')); // uppercase not allowed
        assert.ok(!isValidEventId('has space'));
    });

    test('isValidEventId enforces the exact length bounds (5..1024) and rejects empty', () => {
        assert.ok(isValidEventId('00000')); // exactly 5 — accepted
        assert.ok(!isValidEventId('0000')); // 4 — rejected on length alone
        assert.ok(!isValidEventId('')); // empty — rejected
        assert.ok(isValidEventId('0'.repeat(1024))); // exactly 1024 — accepted
        assert.ok(!isValidEventId('0'.repeat(1025))); // 1025 — rejected on length alone
    });

    test('passes through an already-valid non-UUID base32hex id', () => {
        // The org-id need not be a UUID; any base32hex string round-trips
        // (lowercased) so the derived event id stays idempotent.
        assert.equal(taskIdToEventId('abcdef012345'), 'abcdef012345');
    });

    test('throws for an id that cannot form a valid event id', () => {
        assert.throws(() => taskIdToEventId('xyz'), /event id/);
    });
});
