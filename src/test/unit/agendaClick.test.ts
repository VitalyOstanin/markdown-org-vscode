import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import type { ClickTargetLike } from '../../utils/agendaClick';
import { resolveOccurrenceClickIntent, resolveTaskClickIntent, sanitizeTaskLine } from '../../utils/agendaClick';

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

    test('a task line missing the file it points at opens nothing', () => {
        // A card rendered from a group that lost its source keeps the class but
        // carries no `data-file`. Opening on that would raise an error about an
        // empty path; the click is dropped instead.
        const { window } = setupDom();
        const target = window.document.querySelector('.task-line')!;
        target.removeAttribute('data-file');

        const sel = window.getSelection()!;
        sel.removeAllRanges();
        const intent = resolveTaskClickIntent({ target }, sel);
        assert.strictEqual(intent, null);
    });

    test('a task line missing the line it points at opens nothing', () => {
        const { window } = setupDom();
        const target = window.document.querySelector('.task-line')!;
        target.removeAttribute('data-line');

        const sel = window.getSelection()!;
        sel.removeAllRanges();
        const intent = resolveTaskClickIntent({ target }, sel);
        assert.strictEqual(intent, null);
    });

    test('a line number that is not a number opens nothing', () => {
        // The attribute reaches the DOM as text, and text that survives the
        // render but not `parseInt` would otherwise open the file at NaN.
        const { window } = setupDom();
        const target = window.document.querySelector('.task-line')!;
        target.setAttribute('data-line', 'not-a-line');

        const sel = window.getSelection()!;
        sel.removeAllRanges();
        const intent = resolveTaskClickIntent({ target }, sel);
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

/**
 * The flag of a repeating row is the way into the two things that can be done
 * to the one occurrence the row stands for. Everywhere else on the row -- and
 * on the flag of a row that does not repeat -- a click still opens the file.
 */
suite('resolveOccurrenceClickIntent (jsdom)', () => {
    function setupDom() {
        const dom = new JSDOM(
            `<!DOCTYPE html>
            <html><body>
              <div id="content">
                <div class="task-line" data-file="/work/notes.md" data-line="42" data-occurrence="2026-08-20">
                  <span class="flag" data-flag="repeat"></span>
                  <span class="heading">Weekly class</span>
                </div>
                <div class="task-line" data-file="/work/notes.md" data-line="70">
                  <span class="flag" data-flag="scheduled"></span>
                  <span class="heading">A single day</span>
                </div>
              </div>
            </body></html>`,
            { pretendToBeVisual: true }
        );
        const { window } = dom;
        const at = (selector: string) => window.document.querySelector(selector) as unknown as ClickTargetLike;
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        return { window, at, sel };
    }

    test('the flag of a repeating row names the day the row was drawn on', () => {
        const { at, sel } = setupDom();

        const intent = resolveOccurrenceClickIntent({ target: at('.task-line .flag') }, sel);

        assert.deepStrictEqual(intent, { file: '/work/notes.md', line: 42, date: '2026-08-20' });
    });

    test('the flag of a row that does not repeat is not about an occurrence', () => {
        const { at, sel } = setupDom();

        const intent = resolveOccurrenceClickIntent({ target: at('.task-line:nth-child(2) .flag') }, sel);

        assert.strictEqual(intent, null);
    });

    test('the rest of a repeating row still opens the file', () => {
        const { at, sel } = setupDom();

        assert.strictEqual(resolveOccurrenceClickIntent({ target: at('.task-line .heading') }, sel), null);
        assert.deepStrictEqual(resolveTaskClickIntent({ target: at('.task-line .heading') }, sel), {
            file: '/work/notes.md',
            line: 42
        });
    });

    test('a selection drag that ends on the flag is not a click on it', () => {
        const { window, at } = setupDom();
        const row = window.document.querySelector('.task-line')!;
        const range = window.document.createRange();
        range.selectNodeContents(row);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);

        assert.strictEqual(resolveOccurrenceClickIntent({ target: at('.task-line .flag') }, sel), null);
    });
});
