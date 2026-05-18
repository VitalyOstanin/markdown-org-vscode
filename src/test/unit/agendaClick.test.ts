import * as assert from 'assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import { resolveTaskClickIntent, sanitizeTaskLine, ClickTargetLike } from '../../utils/agendaClick';

// jsdom is the only practical way to exercise the agenda webview's
// click-vs-selection behaviour without spinning up a full VS Code instance
// (extension-host tests cannot reach into the webview's DOM). We only use
// jsdom for this one scenario; everything else stays in regular tests.
suite('resolveTaskClickIntent (jsdom)', () => {
    function setupDom() {
        const dom = new JSDOM(
            `<!DOCTYPE html>
            <html><body>
              <div id="content">
                <div class="task-line" data-file="/work/notes.md" data-line="42">
                  <span>DEADLINE ⌃</span>
                  <span>Heading text</span>
                </div>
              </div>
            </body></html>`,
            { pretendToBeVisual: true }
        );
        const { window } = dom;
        const taskLine = window.document.querySelector('.task-line') as unknown as ClickTargetLike;
        return { window, taskLine };
    }

    test('returns null when an active selection covers part of the task line', () => {
        const { window, taskLine } = setupDom();
        const target = window.document.querySelector('.task-line')!;

        // Build a real text selection inside the task line -- this matches
        // what a touchpad double-tap-drag produces in a real webview.
        const range = window.document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        assert.ok(!sel.isCollapsed, 'sanity: selection must not be collapsed');
        assert.ok(sel.toString().length > 0, 'sanity: selection text must not be empty');

        const intent = resolveTaskClickIntent({ target: taskLine }, sel);
        assert.strictEqual(intent, null, 'must not open the task while a selection is active');
    });

    test('returns the task ref on a plain click with no selection', () => {
        const { window, taskLine } = setupDom();

        // Collapse any selection that might be left around.
        const sel = window.getSelection()!;
        sel.removeAllRanges();

        const intent = resolveTaskClickIntent({ target: taskLine }, sel);
        assert.deepStrictEqual(intent, { file: '/work/notes.md', line: 42 });
    });

    test('returns null when the click did not land on a .task-line', () => {
        const { window } = setupDom();
        const outside = window.document.body as unknown as ClickTargetLike;

        const intent = resolveTaskClickIntent({ target: outside }, window.getSelection());
        assert.strictEqual(intent, null);
    });

    test('returns null when target is null (e.g. detached event)', () => {
        const intent = resolveTaskClickIntent({ target: null }, null);
        assert.strictEqual(intent, null);
    });
});

suite('sanitizeTaskLine', () => {
    // Defense in depth: even though `markdown-org-extract` contracts task.line
    // as number, the webview must never interpolate an unsanitized value into
    // the data-line attribute -- a string like `1" onmouseover="x` would break
    // out of the attribute and inject HTML. sanitizeTaskLine guarantees that
    // the value built into the attribute is always a finite non-negative
    // integer that needs no HTML escaping.

    test('passes through a positive integer unchanged', () => {
        assert.strictEqual(sanitizeTaskLine(42), 42);
    });

    test('passes through zero unchanged', () => {
        assert.strictEqual(sanitizeTaskLine(0), 0);
    });

    test('coerces a numeric string to its integer value', () => {
        // Extractor contract is number, but be lenient for forward-compat.
        assert.strictEqual(sanitizeTaskLine('17'), 17);
    });

    test('truncates a float toward zero (line numbers are integer)', () => {
        assert.strictEqual(sanitizeTaskLine(12.9), 12);
        assert.strictEqual(sanitizeTaskLine(-3.2), 0);
    });

    test('returns 0 for negative integers (no negative line indices)', () => {
        assert.strictEqual(sanitizeTaskLine(-1), 0);
    });

    test('returns 0 for NaN / Infinity', () => {
        assert.strictEqual(sanitizeTaskLine(NaN), 0);
        assert.strictEqual(sanitizeTaskLine(Infinity), 0);
        assert.strictEqual(sanitizeTaskLine(-Infinity), 0);
    });

    test('returns 0 for an HTML-injection attempt that breaks Number coercion', () => {
        // Worst case the regression targets: a string crafted to escape the
        // data-line attribute. Number('1" onmouseover="x') is NaN; result is 0.
        assert.strictEqual(sanitizeTaskLine('1" onmouseover="x'), 0);
        assert.strictEqual(sanitizeTaskLine('"></div><script>alert(1)</script>'), 0);
    });

    test('returns 0 for non-numeric inputs (null, undefined, object, array)', () => {
        assert.strictEqual(sanitizeTaskLine(null), 0);
        assert.strictEqual(sanitizeTaskLine(undefined), 0);
        assert.strictEqual(sanitizeTaskLine({}), 0);
        assert.strictEqual(sanitizeTaskLine([1, 2]), 0);
    });
});
