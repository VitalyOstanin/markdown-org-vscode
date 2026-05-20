import * as assert from 'assert';
import { suite, test } from 'mocha';
import { buildTimeInfo } from '../../utils/agendaTimeInfo';

// `buildTimeInfo` is inlined into the agenda webview via
// `.toString()`, so these unit tests transitively cover the runtime
// rendering of the timeInfo cell.
//
// Stable invariant: the cell may render multiple visual lines (a SCHEDULED
// time followed by a DEADLINE marker), but it never relies on a "see the
// line above" caret (⌃) -- the two-line stack of `time` and `DEADLINE`
// is unambiguous on its own. This used to be hinted by ` ⌃` after the
// type label, which only made sense when CSS wrap happened to break the
// inline flow; on narrower fonts the wrap did not occur and the caret
// pointed at unrelated content above (different task or section header).
//
// Markup contract: a non-SCHEDULED, non-PLAIN timestamp_type is wrapped in
// its own <span class="timestamp-deadline|timestamp-type"> sibling. The CSS
// rule for those classes uses `display: block`, which forces a line break
// regardless of available width.
function noopEscape(value: string): string {
    return value;
}

suite('buildTimeInfo (agenda timeInfo cell)', () => {
    test('never emits the legacy ⌃ caret', () => {
        const variants = [
            buildTimeInfo({ timestamp_time: '10:00', timestamp_type: 'DEADLINE' }, undefined, noopEscape),
            buildTimeInfo({ timestamp_type: 'DEADLINE' }, undefined, noopEscape),
            buildTimeInfo({ timestamp_time: '14:30' }, undefined, noopEscape),
            buildTimeInfo({ timestamp_type: 'SCHEDULED' }, -3, noopEscape),
            buildTimeInfo({}, 5, noopEscape),
            buildTimeInfo({}, 0, noopEscape),
            buildTimeInfo({}, undefined, noopEscape)
        ];
        for (const html of variants) {
            assert.ok(!html.includes('⌃'), `expected no caret in: ${html}`);
        }
    });

    test('timed DEADLINE -> stacked time + DEADLINE block', () => {
        const html = buildTimeInfo({ timestamp_time: '10:00', timestamp_type: 'DEADLINE' }, undefined, noopEscape);
        assert.ok(html.includes('<span class="time-display">10:00......</span>'));
        assert.ok(html.includes('<span class="timestamp-deadline">DEADLINE</span>'));
        // The two pieces are siblings inside the same cell -- no <br>, the
        // visual stack is achieved by CSS `display: block` on the type span.
        assert.ok(!html.includes('<br'));
    });

    test('untimed DEADLINE -> single DEADLINE block, no time, no caret', () => {
        const html = buildTimeInfo({ timestamp_type: 'DEADLINE' }, undefined, noopEscape);
        assert.strictEqual(html, '<span class="timestamp-deadline">DEADLINE</span>');
    });

    test('timed SCHEDULED -> time alone, no type marker', () => {
        const html = buildTimeInfo({ timestamp_time: '14:30', timestamp_type: 'SCHEDULED' }, undefined, noopEscape);
        assert.strictEqual(html, '<span class="time-display">14:30......</span>');
    });

    test('PLAIN type without time -> empty (no marker, no caret)', () => {
        const html = buildTimeInfo({ timestamp_type: 'PLAIN' }, undefined, noopEscape);
        assert.strictEqual(html, '');
    });

    test('past offset with SCHEDULED -> Sched.Nx: label', () => {
        const html = buildTimeInfo({ timestamp_type: 'SCHEDULED' }, -3, noopEscape);
        assert.strictEqual(html, 'Sched.3x:');
    });

    test('past offset without SCHEDULED -> "N d. ago:" label', () => {
        const html = buildTimeInfo({}, -2, noopEscape);
        assert.strictEqual(html, '2 d. ago:');
    });

    test('future offset -> "In N d.:" label', () => {
        const html = buildTimeInfo({}, 4, noopEscape);
        assert.strictEqual(html, 'In 4 d.:');
    });

    test('offset 0 with no time and no type -> empty', () => {
        const html = buildTimeInfo({}, 0, noopEscape);
        assert.strictEqual(html, '');
    });

    test('uses escapeHtml on type label (defense-in-depth)', () => {
        const calls: string[] = [];
        const tracking = (s: string): string => {
            calls.push(s);
            return s;
        };
        buildTimeInfo({ timestamp_type: 'DEADLINE' }, undefined, tracking);
        assert.ok(calls.includes('DEADLINE'), 'type label should be passed through escapeHtml');
    });

    test('uses escapeHtml on time label', () => {
        const calls: string[] = [];
        const tracking = (s: string): string => {
            calls.push(s);
            return s;
        };
        buildTimeInfo({ timestamp_time: '10:00' }, undefined, tracking);
        assert.ok(calls.includes('10:00'), 'time label should be passed through escapeHtml');
    });
});
