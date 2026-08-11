import * as assert from 'node:assert';
import { planPriorityToggle } from '../../utils/priorityToggle';

// `togglePriority` used to read the cookie only where a client writes it --
// right after the keyword -- so a cookie the user typed further along the line
// was invisible to it and pressing the key added a second one. The extractor
// reads a cookie wherever it sits (ADR-0027 there), and so does this now: the
// toggle clears the cookie it finds, in place, and adds one only when the
// heading carries none.
suite('Priority toggle', () => {
    test('adds a cookie to a heading that carries none', () => {
        assert.strictEqual(planPriorityToggle('## TODO Task title'), '## TODO [#A] Task title');
    });

    test('adds a cookie to a heading without a keyword', () => {
        assert.strictEqual(planPriorityToggle('## Task title'), '## [#A] Task title');
    });

    test('clears a cookie in the canonical place', () => {
        assert.strictEqual(planPriorityToggle('## TODO [#A] Task title'), '## TODO Task title');
    });

    test('clears a cookie written in the middle of the title', () => {
        assert.strictEqual(planPriorityToggle('## TODO Buy [#A] filter'), '## TODO Buy filter');
    });

    test('clears a cookie written last', () => {
        assert.strictEqual(
            planPriorityToggle('## TODO Title with a trailing cookie [#A]'),
            '## TODO Title with a trailing cookie'
        );
    });

    test('does not add a second cookie next to one already on the line', () => {
        const once = planPriorityToggle('## TODO Buy [#A] filter');

        assert.ok(once);
        assert.strictEqual((once.match(/\[#/g) ?? []).length, 0);
    });

    test('clears a numeric cookie the same way', () => {
        assert.strictEqual(planPriorityToggle('## TODO Ship it [#12]'), '## TODO Ship it');
    });

    test('leaves what is out of range in the title and adds a cookie', () => {
        // `[#65]` is not a priority (the range ends at 64), so it is text: the
        // toggle has nothing to clear and puts a real cookie in front.
        assert.strictEqual(planPriorityToggle('## TODO Over the top [#65]'), '## TODO [#A] Over the top [#65]');
    });

    test('refuses a line that is not a heading', () => {
        assert.strictEqual(planPriorityToggle('plain text'), undefined);
    });
});
