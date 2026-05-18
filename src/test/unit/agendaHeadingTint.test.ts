import * as assert from 'assert';
import { suite, test } from 'mocha';
import { resolveHeadingClass } from '../../utils/agendaHeadingTint';

// `resolveHeadingClass` is inlined into the agenda webview via
// `.toString()`, so these unit tests transitively cover the runtime
// behaviour without spinning up a webview / extension host.
suite('resolveHeadingClass', () => {
    test('DEADLINE without priority -> deadline-heading', () => {
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'DEADLINE' }), 'deadline-heading');
    });

    test('DEADLINE wins over priority A', () => {
        // The whole point of the precedence rule: a missed deadline is
        // the louder signal, so even a high-priority task gets the
        // deadline color, not the priority color.
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'DEADLINE', priority: 'A' }), 'deadline-heading');
    });

    test('DEADLINE wins over priority B / C too', () => {
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'DEADLINE', priority: 'B' }), 'deadline-heading');
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'DEADLINE', priority: 'C' }), 'deadline-heading');
    });

    test('priority A without DEADLINE -> heading-priority-a', () => {
        assert.strictEqual(resolveHeadingClass({ priority: 'A' }), 'heading-priority-a');
    });

    test('priority B / C without DEADLINE -> matching class', () => {
        assert.strictEqual(resolveHeadingClass({ priority: 'B' }), 'heading-priority-b');
        assert.strictEqual(resolveHeadingClass({ priority: 'C' }), 'heading-priority-c');
    });

    test('priority lowercase is normalized', () => {
        // Extract should always emit upper-case, but be tolerant.
        assert.strictEqual(resolveHeadingClass({ priority: 'a' }), 'heading-priority-a');
    });

    test('no DEADLINE and no priority -> empty class', () => {
        assert.strictEqual(resolveHeadingClass({}), '');
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'SCHEDULED' }), '');
        assert.strictEqual(resolveHeadingClass({ timestamp_type: null }), '');
    });

    test('SCHEDULED with priority -> priority class wins (no DEADLINE)', () => {
        // SCHEDULED is not a DEADLINE, so it does not override priority.
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'SCHEDULED', priority: 'A' }), 'heading-priority-a');
    });

    test('empty string priority is treated as "no priority"', () => {
        assert.strictEqual(resolveHeadingClass({ priority: '' }), '');
    });

    test('null priority is treated as "no priority"', () => {
        assert.strictEqual(resolveHeadingClass({ priority: null }), '');
    });

    test('CLOSED / CREATED do not override priority', () => {
        // Only DEADLINE is treated as the louder signal. CLOSED and
        // CREATED are informational timestamps, not deadlines.
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'CLOSED', priority: 'B' }), 'heading-priority-b');
        assert.strictEqual(resolveHeadingClass({ timestamp_type: 'CREATED', priority: 'C' }), 'heading-priority-c');
    });
});
