import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

/**
 * That what the unit coverage profile leaves out is left out for a reason.
 *
 * `.c8rc.json` excludes by path, and a path is a coarse instrument: it names
 * directories, while the reason for excluding is a property of files -- a
 * module that cannot load without a VS Code host has nothing to measure in a
 * unit run. The two drift apart silently. `out/diagnostics/**` was written when
 * every file under it imported `vscode`; a pure one added later fell out of the
 * gate without anyone deciding that, and its own unit test counted for nothing.
 *
 * So the rule is checked per file rather than per pattern: each source the
 * profile excludes must either reach `vscode` (directly or through what it
 * imports), or compile to no executable code, or live in the webview, which
 * neither runner instruments. Anything else is a file that belongs in the gate.
 */
suite('the unit coverage profile', () => {
    const root = path.resolve(__dirname, '..', '..', '..');
    const src = path.join(root, 'src');

    /** Every `.ts` file of `src`, tests excluded: they are excluded by name. */
    function sources(): string[] {
        const found: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'test') {
                        walk(full);
                    }
                } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
                    found.push(full);
                }
            }
        };
        walk(src);
        return found;
    }

    /** A c8 glob as a pattern: `**` spans directories, `*` stops at one. */
    function globToRegExp(glob: string): RegExp {
        const escaped = glob.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`);
        const body = escaped.replaceAll('**/', '(?:.*/)?').replaceAll('**', '.*').replaceAll('*', '[^/]*');
        return new RegExp(`^${body}$`);
    }

    /** What the file emits under `out/`, as `.c8rc.json` spells it. */
    function emittedPath(file: string): string {
        return path.posix.join('out', path.relative(src, file).split(path.sep).join('/')).replace(/\.ts$/, '.js');
    }

    /** The modules a file pulls in at run time -- `import type` carries nothing. */
    function runtimeImports(file: string): string[] {
        const text = fs.readFileSync(file, 'utf8');
        const found: string[] = [];
        for (const match of text.matchAll(/^import\s+(?!type\s)(?:[\s\S]*?)from\s+'([^']+)';/gm)) {
            const spec = match[1];
            if (spec !== undefined) {
                found.push(spec);
            }
        }
        return found;
    }

    /** Does the file reach `vscode`, itself or through what it imports? */
    function reachesVscode(file: string, seen = new Set<string>()): boolean {
        if (seen.has(file)) {
            return false;
        }
        seen.add(file);
        for (const spec of runtimeImports(file)) {
            if (spec === 'vscode') {
                return true;
            }
            if (!spec.startsWith('.')) {
                continue;
            }
            const resolved = path.resolve(path.dirname(file), `${spec}.ts`);
            if (fs.existsSync(resolved) && reachesVscode(resolved, seen)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Does the file compile to nothing worth measuring?
     *
     * A source of types alone emits a stub: the strict-mode prologue and the
     * marker `exports.__esModule`, no statement of its own.
     */
    function emitsNoCode(file: string): boolean {
        const emitted = path.join(root, emittedPath(file));
        if (!fs.existsSync(emitted)) {
            return true;
        }
        const body = fs
            .readFileSync(emitted, 'utf8')
            // Comments carry the reasoning of a declaration file, which is most
            // of what such a file is: strip them before asking what is left.
            .replaceAll(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(
                (line) =>
                    line !== '' &&
                    !line.startsWith('//') &&
                    line !== '"use strict";' &&
                    !line.startsWith('Object.defineProperty(exports,') &&
                    !line.startsWith('//# sourceMappingURL=')
            );
        return body.length === 0;
    }

    test('every source it leaves out is a source a unit run cannot measure', () => {
        const config = JSON.parse(fs.readFileSync(path.join(root, '.c8rc.json'), 'utf8')) as {
            exclude: string[];
        };
        const excluded = config.exclude.map((glob) => globToRegExp(glob));
        const unexplained = sources()
            .filter((file) => excluded.some((pattern) => pattern.test(emittedPath(file))))
            .filter((file) => !reachesVscode(file))
            .filter((file) => !emitsNoCode(file))
            // The webview client is read for inlining rather than executed, so
            // neither runner instruments it (see DEVELOPMENT.md, "Coverage").
            .filter((file) => !path.relative(src, file).startsWith(`webview${path.sep}`))
            .map((file) => path.relative(src, file))
            .sort();

        assert.deepStrictEqual(
            unexplained,
            [],
            'excluded from the unit coverage gate without needing a VS Code host: ' +
                'narrow the pattern in .c8rc.json to the files that do'
        );
    });
});
