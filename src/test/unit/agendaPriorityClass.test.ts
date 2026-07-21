import * as assert from 'node:assert/strict';
import { priorityClass } from '../../utils/agendaPriorityClass';

suite('agendaPriorityClass.priorityClass', () => {
    test('returns priority-<lower> for a normal single-letter priority', () => {
        assert.equal(priorityClass('A'), 'priority-a');
        assert.equal(priorityClass('b'), 'priority-b');
        assert.equal(priorityClass('C1'), 'priority-c1');
    });

    test('returns empty string for empty/undefined/null', () => {
        assert.equal(priorityClass(''), '');
        assert.equal(priorityClass(undefined), '');
        assert.equal(priorityClass(null), '');
    });

    test('rejects attribute-injection payloads (no quotes/brackets leak into the class)', () => {
        // Hostile extractor input that would otherwise break out of class="...".
        assert.equal(priorityClass('A" data-x="y'), '');
        assert.equal(priorityClass('A"><script>alert(1)</script>'), '');
        assert.equal(priorityClass('a b'), '');
        assert.equal(priorityClass('A-B'), '');
    });
});
