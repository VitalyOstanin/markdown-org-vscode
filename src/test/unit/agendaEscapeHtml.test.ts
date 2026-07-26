import * as assert from 'assert';
import { suite, test } from 'mocha';
import { escapeHtml } from '../../utils/agendaEscapeHtml';

// The agenda webview interpolates task data into both element text and
// quoted HTML attributes (`data-file`, `data-priority`, `title`, ...), so a
// value that can close the attribute would let a task file inject markup.
// The webview embeds this source via `.toString()`, so these tests cover the
// runtime escaping too.
suite('escapeHtml', () => {
    test('escapes the five characters that can break out of markup', () => {
        assert.strictEqual(escapeHtml('&'), '&amp;');
        assert.strictEqual(escapeHtml('<'), '&lt;');
        assert.strictEqual(escapeHtml('>'), '&gt;');
        assert.strictEqual(escapeHtml('"'), '&quot;');
        assert.strictEqual(escapeHtml("'"), '&#39;');
    });

    test('a double quote cannot close a quoted attribute', () => {
        // The concrete attack the previous DOM-based implementation allowed:
        // `div.textContent`/`innerHTML` leaves `"` untouched, so a file name
        // carrying one closed data-file early and injected a second data-line,
        // which wins over the real one when the browser parses duplicates.
        const hostile = 'notes.md" data-line="999';
        const attribute = ' data-file="' + escapeHtml(hostile) + '"';
        assert.strictEqual(attribute, ' data-file="notes.md&quot; data-line=&quot;999"');
        assert.ok(!/data-file="[^"]*"\s+data-line=/.test(attribute));
    });

    test('escapes the ampersand first so an escape is not double-encoded', () => {
        // Naive ordering (< before &) would turn `<` into `&amp;lt;`.
        assert.strictEqual(escapeHtml('&lt;'), '&amp;lt;');
        assert.strictEqual(escapeHtml('a & b < c'), 'a &amp; b &lt; c');
    });

    test('leaves ordinary text untouched and treats empty input as empty', () => {
        assert.strictEqual(escapeHtml('Review the plan'), 'Review the plan');
        assert.strictEqual(escapeHtml(''), '');
    });

    test('coerces nullish and non-string input instead of printing "undefined" markup', () => {
        // Task fields are optional in the extractor JSON, and the webview calls
        // this on values that an older extractor may omit entirely.
        assert.strictEqual(escapeHtml(undefined), '');
        assert.strictEqual(escapeHtml(null), '');
        assert.strictEqual(escapeHtml(42 as unknown as string), '42');
    });
});
