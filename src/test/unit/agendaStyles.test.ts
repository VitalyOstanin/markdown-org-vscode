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
        // Exclude `content: "[#"` -- the monospace-preset marker text, not a colour.
        const withoutContent = AGENDA_STYLES.replace(/content:\s*"[^"]*"/g, '');
        const hexes = withoutContent.match(/#[0-9a-fA-F]{3,8}\b/g);
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

    test('defines all three presets', () => {
        assert.ok(AGENDA_STYLES.includes('[data-agenda-style="monospace"]'));
        assert.ok(AGENDA_STYLES.includes('[data-agenda-style="native"]'));
        assert.ok(AGENDA_STYLES.includes('[data-agenda-style="hybrid"]'));
    });

    test('no hardcoded hex colours anywhere', () => {
        const withoutContent = AGENDA_STYLES.replace(/content:\s*"[^"]*"/g, '');
        assert.strictEqual(/#[0-9a-fA-F]{3,8}\b/.test(withoutContent), false);
    });

    test('hybrid time/offset use tabular-nums', () => {
        assert.ok(/font-variant-numeric:\s*tabular-nums/.test(AGENDA_STYLES));
    });

    test('fonts are driven by config vars, not a hardcoded family', () => {
        // Proportional and monospace families both come from configurable CSS
        // vars so the settings can override them; no literal 'Courier New'.
        assert.ok(AGENDA_STYLES.includes('var(--markdown-org-agenda-font)'));
        assert.ok(AGENDA_STYLES.includes('var(--markdown-org-agenda-mono-font)'));
        assert.strictEqual(AGENDA_STYLES.includes('Courier New'), false);
    });

    test('ledger all-mono override targets data-ledger-mono', () => {
        assert.ok(
            /\[data-agenda-style="ledger"\]\[data-ledger-mono="true"\]\s*\{[^}]*var\(--markdown-org-agenda-mono-font\)/.test(
                AGENDA_STYLES
            )
        );
    });

    // renderTask emits five visible cells once .todo-label is hidden
    // (time-info-cell, status, priority, heading, offset). The native/hybrid
    // presets hide .todo-label, so their .task-line grid MUST declare exactly
    // five columns -- a mismatch (e.g. four) makes `1fr` land on the wrong
    // cell and pushes the heading/offset columns off to the side.
    const EXPECTED_COLUMNS: Record<string, number> = { native: 5, hybrid: 5, ledger: 6 };
    for (const [preset, cols] of Object.entries(EXPECTED_COLUMNS)) {
        test(`${preset} .task-line grid declares ${cols} columns`, () => {
            const m = AGENDA_STYLES.match(
                new RegExp(
                    `\\[data-agenda-style="${preset}"\\]\\s*\\.task-line\\s*\\{[^}]*grid-template-columns:\\s*([^;]+);`
                )
            );
            assert.ok(m, `expected a grid-template-columns rule for the ${preset} .task-line`);
            const tracks = m[1].trim().split(/\s+/);
            assert.strictEqual(
                tracks.length,
                cols,
                `${preset} .task-line must have ${cols} columns (one per visible cell), found ${tracks.length}: ${m[1].trim()}`
            );
        });
    }

    test('defines the ledger preset', () => {
        assert.ok(AGENDA_STYLES.includes('[data-agenda-style="ledger"]'));
    });

    test('ledger preset declares all four flag glyphs', () => {
        for (const glyph of ['⚑', '◷', '↻', '⊘']) {
            assert.ok(AGENDA_STYLES.includes(`content: "${glyph}"`), `expected flag glyph ${glyph} in ledger CSS`);
        }
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
