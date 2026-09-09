import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { DOCS_STYLES } from '../../views/docsStyles';

/**
 * The help panel follows the editor's theme, the same invariant the agenda's
 * stylesheet is held to (#181): every colour resolves through a
 * `var(--vscode-*)` token, and nothing is fetched -- the page is served with a
 * policy that forbids it, so a `url()` would render as a gap rather than an
 * error.
 */
suite('DOCS_STYLES', () => {
    test('contains no hardcoded HEX colours', () => {
        const hexes = DOCS_STYLES.match(/#[0-9a-fA-F]{3,8}\b/g);
        assert.strictEqual(hexes, null, `found hardcoded colours: ${hexes?.join(', ')}`);
    });

    test('paints the page in the editor surface', () => {
        assert.ok(DOCS_STYLES.includes('var(--vscode-editor-background)'));
        assert.ok(DOCS_STYLES.includes('var(--vscode-font-family)'));
    });

    test('loads nothing: no url() anywhere', () => {
        assert.strictEqual(DOCS_STYLES.includes('url('), false);
    });

    test('a wide table scrolls inside its own block, not the page', () => {
        assert.match(DOCS_STYLES, /overflow-x:\s*auto/);
        assert.strictEqual(/body\s*\{[^}]*overflow-x/.test(DOCS_STYLES), false);
    });

    test('the contents stays put while the text scrolls', () => {
        assert.match(DOCS_STYLES, /#contents\s*\{[^}]*position:\s*sticky/s);
    });
});
