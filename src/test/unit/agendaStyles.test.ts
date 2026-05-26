import * as assert from 'assert';
import { suite, test } from 'mocha';
import { AGENDA_STYLES } from '../../views/agendaStyles';

/**
 * Theming invariant for the agenda webview (#11): the panel must follow the
 * active VS Code theme, so every colour has to resolve through a
 * `var(--vscode-*)` token (optionally inside a `color-mix()`), with no
 * hardcoded HEX values that would freeze the panel to one palette.
 */
suite('AGENDA_STYLES theming invariant', () => {
    test('contains no hardcoded HEX colours', () => {
        const hexes = AGENDA_STYLES.match(/#[0-9a-fA-F]{3,8}\b/g);
        assert.strictEqual(hexes, null, `agenda CSS must not hardcode colours; found: ${hexes?.join(', ')}`);
    });

    test('drives colours from VS Code theme variables', () => {
        assert.ok(AGENDA_STYLES.includes('var(--vscode-'), 'agenda CSS must use var(--vscode-*) theme tokens');
    });

    test('maps the editor surface to editor-background/-foreground', () => {
        assert.ok(AGENDA_STYLES.includes('var(--vscode-editor-background)'));
        assert.ok(AGENDA_STYLES.includes('var(--vscode-editor-foreground)'));
    });

    test('maps TODO/DONE/priority semantics to chart colours', () => {
        for (const token of ['charts-red', 'charts-green', 'charts-yellow', 'charts-blue']) {
            assert.ok(
                AGENDA_STYLES.includes(`var(--vscode-${token})`),
                `expected semantic colour var(--vscode-${token}) in agenda CSS`
            );
        }
    });

    test('subtle calendar tints are mixed over the theme background', () => {
        // weekend / holiday / today have no exact theme token, so they are
        // color-mix()-ed from a semantic colour over the base background.
        const mixes = AGENDA_STYLES.match(/color-mix\(in srgb,/g) ?? [];
        assert.ok(mixes.length >= 3, `expected >=3 color-mix() tints, found ${mixes.length}`);
    });
});

/**
 * Spacing-scale invariant for the agenda webview (#20): all padding/margin/gap
 * must come from a single 4/8/12/16/20 token scale declared once in `:root`
 * (`--space-1..5`), and font-size must be expressed in a single unit (em or a
 * `var(--vscode-font-size)` derivative) -- no off-scale px spacing and no px
 * font-size scattered through the rules. The fixed grid-column widths, the
 * indicator dot size and border widths are markup sizes and stay in px.
 */
suite('AGENDA_STYLES spacing-scale invariant', () => {
    const SCALE: ReadonlyArray<readonly [string, string]> = [
        ['--space-1', '4px'],
        ['--space-2', '8px'],
        ['--space-3', '12px'],
        ['--space-4', '16px'],
        ['--space-5', '20px']
    ];

    test('declares the 4/8/12/16/20 --space scale once in :root', () => {
        assert.ok(/:root\s*\{/.test(AGENDA_STYLES), 'agenda CSS must declare a :root block for --space-*');
        for (const [name, value] of SCALE) {
            assert.ok(
                new RegExp(`${name}:\\s*${value};`).test(AGENDA_STYLES),
                `expected scale token ${name}: ${value}; in :root`
            );
        }
    });

    test('every padding/margin/gap is driven by var(--space-*), no off-scale px', () => {
        // padding | margin[-side] | gap | column-gap declarations.
        const decls = AGENDA_STYLES.match(/\b(?:padding|margin|gap)(?:-[a-z]+)?:\s*[^;]+;/g) ?? [];
        assert.ok(decls.length > 0, 'expected spacing declarations to scan');
        for (const decl of decls) {
            const value = decl.slice(decl.indexOf(':') + 1);
            assert.ok(
                !/\d+px/.test(value),
                `spacing must use var(--space-*) (or 0 / 1ch / auto), found px: ${decl.trim()}`
            );
        }
    });

    test('font-size uses a single unit (em or var(--vscode-font-size)), never px', () => {
        const fontSizes = AGENDA_STYLES.match(/font-size:\s*[^;]+;/g) ?? [];
        assert.ok(fontSizes.length > 0, 'expected font-size declarations to scan');
        for (const fs of fontSizes) {
            assert.ok(
                !/\d+px/.test(fs),
                `font-size must be em or var(--vscode-font-size)-derived, found px: ${fs.trim()}`
            );
        }
    });
});
