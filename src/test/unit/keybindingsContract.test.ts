import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { suite, test } from 'mocha';

/**
 * Keybindings contract: every contributed keybinding must carry a `when`
 * clause. Most bindings live under the `ctrl+k …` / `cmd+k …` chord prefix,
 * which shadows built-in VS Code chords (e.g. `ctrl+k ctrl+t` = Select Color
 * Theme). Scoping each binding to a markdown editor (or the agenda webview)
 * keeps that shadowing confined to where the extension actually operates; a
 * binding with no `when` fires globally (terminal, settings, any editor),
 * hijacking the built-in everywhere.
 *
 * Regression: `markdown-org.cycleTag` was the only binding without a `when`.
 *
 * Static manifest invariant -> pure unit test.
 */
interface Keybinding {
    command: string;
    key?: string;
    when?: string;
}
interface PackageJson {
    contributes?: { keybindings?: Keybinding[] };
}

function loadKeybindings(): Keybinding[] {
    const file = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
    return pkg.contributes?.keybindings ?? [];
}

suite('Keybindings contract', () => {
    const bindings = loadKeybindings();

    test('there are keybindings to check', () => {
        assert.ok(bindings.length > 0);
    });

    test('every keybinding has a when clause (no globally-firing bindings)', () => {
        const missing = bindings.filter((b) => !b.when || b.when.trim() === '').map((b) => b.command);
        assert.deepEqual(missing, [], `keybindings missing a when clause: ${missing.join(', ')}`);
    });

    test('every when clause is scoped to markdown focus or the agenda webview', () => {
        const offenders = bindings
            .filter((b) => {
                const w = b.when ?? '';
                return !(w.includes('editorLangId == markdown') || w.includes('markdown-org.agendaFocused'));
            })
            .map((b) => b.command);
        assert.deepEqual(offenders, [], `keybindings not scoped to markdown/agenda: ${offenders.join(', ')}`);
    });
});
