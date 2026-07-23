import * as assert from 'assert';
import { suite, test } from 'mocha';
import { attentionTooltip, flagTooltip, priorityTooltip } from '../../utils/agendaTooltips';

// These map the terse table-style glyphs / dot colours / priority letters to
// the hover text that explains them. The webview embeds the sources via
// `.toString()`, so these unit tests transitively cover the runtime tooltips.
suite('agenda tooltips', () => {
    test('flagTooltip covers every TaskFlag value', () => {
        assert.strictEqual(flagTooltip('cancelled'), 'Cancelled');
        assert.strictEqual(flagTooltip('deadline'), 'Has a deadline');
        assert.strictEqual(flagTooltip('repeat'), 'Repeating task');
        assert.strictEqual(flagTooltip('scheduled'), 'Scheduled at a set time');
        // The empty flag (no glyph) must produce no tooltip.
        assert.strictEqual(flagTooltip(''), '');
    });

    test('flagTooltip is empty for an unknown value rather than guessing', () => {
        assert.strictEqual(flagTooltip('something-else'), '');
    });

    test('attentionTooltip covers every AttentionLevel value', () => {
        assert.strictEqual(attentionTooltip('done'), 'Done');
        assert.strictEqual(attentionTooltip('cancelled'), 'Cancelled');
        assert.strictEqual(attentionTooltip('danger'), 'Deadline or overdue — needs action');
        assert.strictEqual(attentionTooltip('normal'), 'On schedule');
    });

    test('attentionTooltip is empty for an unknown value', () => {
        assert.strictEqual(attentionTooltip('whatever'), '');
    });

    test('priorityTooltip names the letter and flags the extremes', () => {
        assert.strictEqual(priorityTooltip('A'), 'Priority A (highest)');
        assert.strictEqual(priorityTooltip('B'), 'Priority B');
        assert.strictEqual(priorityTooltip('C'), 'Priority C (lowest)');
    });

    test('priorityTooltip lower-cases-insensitively and trims empties', () => {
        // renderTask passes the raw letter; empty means no priority -> no tooltip.
        assert.strictEqual(priorityTooltip(''), '');
        // A stray lowercase letter should still read sensibly.
        assert.strictEqual(priorityTooltip('a'), 'Priority A (highest)');
    });
});
