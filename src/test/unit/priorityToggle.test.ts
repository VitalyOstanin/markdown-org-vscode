import * as assert from 'node:assert';
import { planPrioritySet, planPriorityToggle, readHeadingPriority } from '../../utils/priorityToggle';

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

// The picker chooses the value, so unlike the toggle this replaces what the
// heading carries instead of clearing it -- and it writes the whole range
// org-mode reads, letters and numbers alike.
suite('Priority set', () => {
    test('adds a numeric cookie to a heading that carries none', () => {
        assert.strictEqual(planPrioritySet('## TODO Task title', '12'), '## TODO [#12] Task title');
    });

    test('replaces the cookie in the canonical place', () => {
        assert.strictEqual(planPrioritySet('## TODO [#A] Task title', 'B'), '## TODO [#B] Task title');
    });

    test('replaces a cookie written in the middle of the title, in the canonical place', () => {
        // Whatever the heading said, it says the new value afterwards, once.
        assert.strictEqual(planPrioritySet('## TODO Buy [#A] filter', '3'), '## TODO [#3] Buy filter');
    });

    test('clears the priority when no value is given', () => {
        assert.strictEqual(planPrioritySet('## TODO [#A] Task title', undefined), '## TODO Task title');
        assert.strictEqual(planPrioritySet('## TODO Buy [#12] filter', undefined), '## TODO Buy filter');
    });

    test('keeps a heading without a keyword keyword-less', () => {
        assert.strictEqual(planPrioritySet('## Task title', 'C'), '## [#C] Task title');
    });

    test('leaves what is out of range in the title', () => {
        // `[#65]` is not a priority, so it is part of the words and stays put.
        assert.strictEqual(planPrioritySet('## TODO Over the top [#65]', 'A'), '## TODO [#A] Over the top [#65]');
    });

    test('refuses a line that is not a heading', () => {
        assert.strictEqual(planPrioritySet('plain text', 'A'), undefined);
    });
});

suite('readHeadingPriority', () => {
    test('reads the cookie in the canonical place', () => {
        assert.strictEqual(readHeadingPriority('## TODO [#A] Task title'), 'A');
    });

    test('reads a cookie written elsewhere on the line', () => {
        assert.strictEqual(readHeadingPriority('## TODO Buy [#12] filter'), '12');
    });

    test('reports none when the heading carries none', () => {
        assert.strictEqual(readHeadingPriority('## TODO Task title'), undefined);
    });

    test('reports none for a line that is not a heading', () => {
        assert.strictEqual(readHeadingPriority('plain text [#A]'), undefined);
    });
});
