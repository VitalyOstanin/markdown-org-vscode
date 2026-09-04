import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

/**
 * That every helper inlined into the agenda page stands on its own.
 *
 * The page is built by taking the source of a list of functions
 * (`AgendaPanel.INLINED_HELPERS`) with `Function.prototype.toString()` and
 * writing it into a `<script>`. That carries the body and nothing else: no
 * module bindings, no `require`, no `exports`. A body that reaches for a
 * module-level name therefore compiles to something the page cannot resolve,
 * and the whole render fails at the first call with `exports is not defined` --
 * an empty panel and one toast, with nothing to say which helper did it.
 *
 * The file comments say so, and it happened anyway: a constant beside a
 * renderer, referenced from inside it, reads as `exports.CARET_SVG` after
 * compilation. This reads the compiled output rather than the source, because
 * that is where the reference appears -- in TypeScript it is a bare name.
 */
suite('the helpers inlined into the agenda page', () => {
    /** `out/`, whichever directory this test was compiled into. */
    const out = path.resolve(__dirname, '..', '..');

    /** The panel as it was compiled, which is what the page is built from. */
    const panel = fs.readFileSync(path.join(out, 'views', 'agendaPanel.js'), 'utf8');

    /** `agendaNavHtml_1` -> the file it was required from. */
    function requiredFiles(): Map<string, string> {
        const found = new Map<string, string>();
        for (const hit of panel.matchAll(/^const (\w+) = require\("([^"]+)"\);$/gm)) {
            const [, alias, request] = hit;
            if (alias === undefined || !request?.startsWith('.')) {
                continue;
            }
            found.set(alias, path.resolve(out, 'views', `${request}.js`));
        }
        return found;
    }

    /** The name each helper is inlined under, and where its source stands. */
    function helpers(): { key: string; alias: string; fn: string }[] {
        const start = panel.indexOf('static INLINED_HELPERS = {');
        const end = panel.indexOf('};', start);
        assert.ok(start >= 0 && end > start, 'INLINED_HELPERS is not in the compiled panel');
        return [...panel.slice(start, end).matchAll(/^\s+(\w+): (\w+)\.(\w+),?$/gm)].map((hit) => ({
            key: hit[1] ?? '',
            alias: hit[2] ?? '',
            fn: hit[3] ?? ''
        }));
    }

    /**
     * The body of `name` in `source`, from its declaration to the closing brace
     * at column 0, with its comments taken out.
     *
     * A comment is carried into the page like everything else and executes
     * there as nothing at all -- including one that names the very mistake this
     * test looks for, which is how the fix for it failed the check.
     */
    function body(source: string, name: string): string | null {
        const declaration = new RegExp(`^(?:async )?function ${name}\\b[\\s\\S]*?\\n}`, 'm');
        const found = declaration.exec(source)?.[0];
        if (found === undefined) {
            return null;
        }
        return found
            .replaceAll(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .map((line) => line.replace(/^\s*\/\/.*$/, ''))
            .join('\n');
    }

    test('none of them reaches for a name the page does not have', () => {
        const files = requiredFiles();
        const offenders: string[] = [];

        for (const helper of helpers()) {
            const file = files.get(helper.alias);
            if (!file) {
                offenders.push(`${helper.key}: ${helper.alias} is required from nowhere`);
                continue;
            }
            const source = fs.readFileSync(file, 'utf8');
            const found = body(source, helper.fn);
            if (found === null) {
                // An arrow constant rather than a declaration: it cannot be read
                // this way, and it cannot be inlined either -- `toString()` of a
                // const arrow carries no name for the page to call it by.
                offenders.push(`${helper.key}: ${helper.fn} is not a function declaration in ${path.basename(file)}`);
                continue;
            }
            // `exports.` is a module-level name of its own file; `<alias>_1.` is
            // one imported from another. Neither exists in the page.
            for (const reach of found.matchAll(/\b(exports\.\w+|\w+_1\.\w+)/g)) {
                offenders.push(`${helper.key} (${path.basename(file)}) reaches for ${reach[1] ?? ''}`);
            }
        }

        assert.deepStrictEqual(
            offenders,
            [],
            `these are written into the page and would fail there:\n  ${offenders.join('\n  ')}`
        );
    });

    test('the list is not empty, so a rename cannot quietly retire the check', () => {
        assert.ok(helpers().length > 50, `only ${helpers().length} helpers were found`);
    });
});
