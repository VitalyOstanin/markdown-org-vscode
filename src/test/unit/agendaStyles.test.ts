import * as assert from 'node:assert';
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
        // Exclude `content: "…"` -- glyph/placeholder marker text, not a colour.
        const withoutContent = AGENDA_STYLES.replaceAll(/content:\s*"[^"]*"/g, '');
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

    test('no hardcoded hex colours anywhere', () => {
        const withoutContent = AGENDA_STYLES.replaceAll(/content:\s*"[^"]*"/g, '');
        assert.strictEqual(/#[0-9a-fA-F]{3,8}\b/.test(withoutContent), false);
    });

    // Where every row carries a date, the emphasis has to sit on what is late.
    // The day and week views keep the opposite rule (a date there means "not
    // this day"), so both overrides must stay scoped to the Tasks card.
    test('the Tasks card spends the date colour on overdue, not upcoming', () => {
        assert.ok(
            /\.day-card\[data-card="tasks"\] \.offset\[data-dir="overdue"\][^}]*var\(--vscode-charts-red\)/s.test(
                AGENDA_STYLES
            ),
            'an overdue date in the Tasks card must be painted red'
        );
        assert.ok(
            /\.day-card\[data-card="tasks"\] \.offset\[data-dir="upcoming"\][^}]*var\(--vscode-descriptionForeground\)/s.test(
                AGENDA_STYLES
            ),
            'an upcoming date in the Tasks card must fall back to the muted meta colour'
        );
    });

    test('the time and offset columns use tabular-nums', () => {
        assert.ok(/font-variant-numeric:\s*tabular-nums/.test(AGENDA_STYLES));
    });

    test('the agenda font is driven by a config var, not a hardcoded family', () => {
        // The proportional family comes from a configurable CSS var so the
        // setting can override it; no literal 'Courier New'.
        assert.ok(AGENDA_STYLES.includes('var(--markdown-org-agenda-font)'));
        assert.strictEqual(AGENDA_STYLES.includes('Courier New'), false);
    });

    // A .task-line lays out six cells: status dot | big time | flag | priority
    // | heading | offset. Its grid MUST declare exactly six columns -- a
    // mismatch makes `1fr` land on the wrong cell and pushes the heading and
    // offset columns off to the side.
    test('.task-line grid declares one column per rendered cell', () => {
        const m = /\.task-line\s*\{[^}]*grid-template-columns:\s*([^;]+);/.exec(AGENDA_STYLES);
        assert.ok(m, 'expected a grid-template-columns rule for .task-line');
        const tracks = m[1]!.trim().split(/\s+/);
        assert.strictEqual(
            tracks.length,
            6,
            `.task-line must have 6 columns (one per rendered cell), found ${tracks.length}: ${m[1]!.trim()}`
        );
    });

    test('declares all four flag glyphs', () => {
        for (const glyph of ['⚑', '◷', '↻', '⊘']) {
            assert.ok(AGENDA_STYLES.includes(`content: "${glyph}"`), `expected flag glyph ${glyph} in the agenda CSS`);
        }
    });

    // The renderer no longer emits a todo label or the stacked time-info cell,
    // and the day-header no longer carries the today arrows, so no rule may
    // reference them: such a rule can only ever be dead weight.
    test('carries no rules for markup the renderer stopped emitting', () => {
        for (const gone of ['.todo-label', '.time-info-cell', '.day-nav']) {
            assert.strictEqual(
                AGENDA_STYLES.includes(gone),
                false,
                `${gone} is no longer rendered, so the agenda CSS must not style it`
            );
        }
    });

    // The week is read by where one day ends and the next begins, and that
    // boundary is a single line down the left edge. At a third of the link
    // colour it was missed on a light theme, so the mix and the width it is
    // drawn at are stated rather than left to whoever edits the block next.
    test('the day line is drawn heavy enough to mark the boundary of a day', () => {
        assert.ok(
            /--day-line:\s*color-mix\(in srgb, var\(--vscode-textLink-foreground\) 60%, transparent\);/.test(
                AGENDA_STYLES
            ),
            'the day line must be mixed at 60% of the link colour'
        );
        assert.ok(
            /#content > \.day-header::before\s*\{[^}]*width:\s*3px;/s.test(AGENDA_STYLES),
            "the day-header's own segment of the line must be 3px wide"
        );
        assert.ok(
            /#content > \.day-header ~ \.task-line,\s*#content > \.day-header ~ \.day-band\s*\{[^}]*border-left:\s*3px solid var\(--day-line\);/s.test(
                AGENDA_STYLES
            ),
            'rows and bands under a day header must carry the same 3px line'
        );
    });

    // The agenda has a single look; the body attribute that used to select
    // between presets is gone, and with it every selector that scoped a rule to
    // one preset.
    test('no selector is scoped to an agenda-style preset', () => {
        assert.strictEqual(AGENDA_STYLES.includes('data-agenda-style'), false);
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
    const SCALE: readonly (readonly [string, string])[] = [
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

/**
 * Shape and type-scale invariants (#38), the same rule the spacing scale
 * already follows: corner radii and font sizes are declared once in `:root` and
 * referenced everywhere else, so two elements meant to be the same component
 * cannot end up a step apart (the month cell's task-load chip and the card
 * section count did: 20px/0.78em against 22px/0.8em).
 */
suite('AGENDA_STYLES shape and type-scale invariant', () => {
    const RADII: readonly (readonly [string, string])[] = [
        ['--radius-sm', '3px'],
        ['--radius-md', '6px'],
        ['--radius-pill', '999px']
    ];

    const FONTS: readonly (readonly [string, string])[] = [
        ['--font-xs', '0.78em'],
        ['--font-sm', '0.85em'],
        ['--font-md', '1em'],
        ['--font-lg', '1.1em'],
        ['--font-xl', '1.5em']
    ];

    test('declares the radius and type scales once in :root', () => {
        for (const [name, value] of [...RADII, ...FONTS]) {
            assert.ok(
                new RegExp(`${name}:\\s*${value};`).test(AGENDA_STYLES),
                `expected scale token ${name}: ${value}; in :root`
            );
        }
    });

    test('every border-radius comes from a --radius token (50% dots aside)', () => {
        const decls = AGENDA_STYLES.match(/border-radius:\s*[^;]+;/g) ?? [];
        assert.ok(decls.length > 0, 'expected border-radius declarations to scan');
        for (const decl of decls) {
            const value = decl.slice(decl.indexOf(':') + 1).trim();
            assert.ok(
                /var\(--radius-(sm|md|pill)\)/.test(value) || value === '50%;',
                `border-radius must use var(--radius-*) or the 50% dot shape, found: ${decl.trim()}`
            );
        }
    });

    test('every font-size comes from a --font token (or the :root base)', () => {
        // Declarations inside :root are the scale itself; skip that block.
        const body = AGENDA_STYLES.slice(AGENDA_STYLES.indexOf('}') + 1);
        const decls = body.match(/font-size:\s*[^;]+;/g) ?? [];
        assert.ok(decls.length > 0, 'expected font-size declarations to scan');
        for (const decl of decls) {
            const value = decl.slice(decl.indexOf(':') + 1).trim();
            assert.ok(
                /var\(--font-(xs|sm|md|lg|xl)\)/.test(value) ||
                    value === 'var(--vscode-font-size);' ||
                    value === 'inherit;' ||
                    // .status renders as a dot: its text is sized away.
                    value === '0;',
                `font-size must use var(--font-*), found: ${decl.trim()}`
            );
        }
    });

    test('the count chip is declared once for both places that use it', () => {
        const shared = /\.task-count,\s*\.day-section-count\s*\{([^}]*)\}/.exec(AGENDA_STYLES);
        assert.ok(shared, 'expected one rule declaring .task-count and .day-section-count together');
        for (const prop of ['min-width', 'border-radius', 'font-size', 'padding']) {
            assert.ok(shared[1]!.includes(prop + ':'), `expected ${prop} on the shared count-chip rule`);
        }
        // Neither of the two may re-declare the shape in its own rule -- the
        // one whose selector is exactly that class, not the shared pair.
        const rules = [...AGENDA_STYLES.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
            selector: m[1]!.replaceAll(/\/\*[\s\S]*?\*\//g, '').trim(),
            body: m[2]
        }));
        for (const cls of ['.task-count', '.day-section-count']) {
            const own = rules.find((r) => r.selector === cls);
            assert.ok(own, `expected a placement rule for ${cls}`);
            for (const prop of ['min-width', 'border-radius', 'font-size']) {
                assert.strictEqual(
                    own.body!.includes(prop + ':'),
                    false,
                    `${cls} must inherit ${prop} from the shared chip rule`
                );
            }
        }
    });

    test('the compact header only resizes the header, it hides nothing', () => {
        const rules = [...AGENDA_STYLES.matchAll(/([^{}]+)\{([^}]*)\}/g)]
            .map((m) => ({ selector: m[1]!.replaceAll(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] }))
            .filter((r) => r.selector.startsWith('body.compact-header'));
        assert.ok(rules.length > 0, 'expected the compact-header block');
        for (const rule of rules) {
            // The layout is a size change, not a different header: dropping a
            // control in compact mode would make it reachable only by resizing
            // the panel, and `auto` resizes it without asking.
            assert.ok(
                !/(display:\s*none|visibility:\s*hidden)/.test(rule.body!),
                `${rule.selector} must not hide anything in compact mode`
            );
        }
        // The header itself has to shrink, otherwise the class buys nothing.
        assert.ok(
            rules.some((r) => r.selector === 'body.compact-header .agenda-header' && r.body!.includes('padding:')),
            'expected the compact header to tighten its own padding'
        );
    });

    test('every interactive surface of the panel shares one focus ring', () => {
        const rule = /((?:\.[a-z-]+:focus-visible,\s*)+\.[a-z-]+:focus-visible)\s*\{/.exec(AGENDA_STYLES);
        assert.ok(rule, 'expected a single :focus-visible rule listing the interactive classes');
        for (const cls of [
            '.nav-btn',
            '.seg-item',
            '.tag-menu-btn',
            '.tag-menu-item',
            '.calendar-day',
            '.day-section-fold'
        ]) {
            assert.ok(rule[1]!.includes(`${cls}:focus-visible`), `${cls} must be covered by the shared focus ring`);
        }
    });
});

/**
 * Render cost (#75). A refresh rebuilds every row, and laying the off-screen
 * ones out is what dominates a large corpus: measured over 1000 tasks, layout
 * was 92 ms of a ~120 ms refresh, against 14 ms with the rows skipped. The rule
 * is a one-line optimisation that is easy to lose in a later edit, so the
 * measurement is pinned here.
 */
suite('AGENDA_STYLES render-cost invariant', () => {
    const taskLineRule = (): string => {
        const match = /\n\s*\.task-line\s*\{([\s\S]*?)\n\s*\}/.exec(AGENDA_STYLES);
        assert.ok(match, 'expected a .task-line rule');
        return match[1]!;
    };

    test('rows outside the viewport are skipped', () => {
        assert.match(taskLineRule(), /content-visibility:\s*auto/);
    });

    test('the skipped rows still declare a height, so the scrollbar means something', () => {
        // Without contain-intrinsic-size a skipped row measures 0 and the whole
        // list collapses; `auto` keeps the real height once a row has been shown.
        assert.match(taskLineRule(), /contain-intrinsic-size:\s*auto\s+\d+px/);
    });
});
