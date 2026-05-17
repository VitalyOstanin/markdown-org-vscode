import * as assert from 'assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import { resolveTaskClickIntent, ClickTargetLike } from '../utils/agendaClick';

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
