import * as assert from 'assert';
import { suite, test } from 'mocha';
import { sanitizeFontFamily } from '../../utils/agendaFontFamily';

// `markdown-org.agendaFontFamily` is interpolated into a nonce'd <style> block
// as the value of a custom property, so a value carrying CSS syntax could add
// rules of its own. Anything that is not a plain font stack is rejected, and
// the caller then falls back to the built-in default.
suite('sanitizeFontFamily', () => {
    test('accepts ordinary font stacks, quoted or bare', () => {
        assert.strictEqual(sanitizeFontFamily('Fira Sans'), 'Fira Sans');
        assert.strictEqual(
            sanitizeFontFamily("'Adwaita Sans', 'Noto Sans', system-ui, sans-serif"),
            "'Adwaita Sans', 'Noto Sans', system-ui, sans-serif"
        );
        assert.strictEqual(sanitizeFontFamily('"JetBrains Mono", monospace'), '"JetBrains Mono", monospace');
        // Non-ASCII family names are legitimate.
        assert.strictEqual(sanitizeFontFamily('Гарнитура Один, sans-serif'), 'Гарнитура Один, sans-serif');
    });

    test('trims surrounding whitespace', () => {
        assert.strictEqual(sanitizeFontFamily('  Fira Sans  '), 'Fira Sans');
    });

    test('rejects a value that closes the declaration and adds rules', () => {
        // The concrete injection: end the custom property, then style the panel
        // (or, with a data: URL, pull in something else entirely).
        assert.strictEqual(sanitizeFontFamily('sans-serif; } body { display: none; } .x {'), '');
        assert.strictEqual(sanitizeFontFamily('sans-serif } * { color: red }'), '');
    });

    test('rejects CSS functions, comments, at-rules and escapes', () => {
        assert.strictEqual(sanitizeFontFamily('local("Fira")'), '');
        assert.strictEqual(sanitizeFontFamily('url(http://example.invalid/f.woff)'), '');
        assert.strictEqual(sanitizeFontFamily('Fira /* comment */ Sans'), '');
        assert.strictEqual(sanitizeFontFamily('@import "x"'), '');
        assert.strictEqual(sanitizeFontFamily('Fira\\0000A Sans'), '');
        assert.strictEqual(sanitizeFontFamily('Fira\nSans'), '');
    });

    test('rejects markup characters even though the value never reaches HTML directly', () => {
        assert.strictEqual(sanitizeFontFamily('</style><script>alert(1)</script>'), '');
    });

    test('rejects an absurdly long value instead of pasting it into every render', () => {
        assert.strictEqual(sanitizeFontFamily('A'.repeat(201)), '');
        assert.strictEqual(sanitizeFontFamily('A'.repeat(200)), 'A'.repeat(200));
    });

    test('treats empty, whitespace-only and nullish input as "use the default"', () => {
        assert.strictEqual(sanitizeFontFamily(''), '');
        assert.strictEqual(sanitizeFontFamily('   '), '');
        assert.strictEqual(sanitizeFontFamily(undefined), '');
        assert.strictEqual(sanitizeFontFamily(null), '');
    });
});
