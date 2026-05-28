import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { suite, test } from 'mocha';

/**
 * `activationEvents` contract: the extension activates as soon as a markdown
 * document is opened (`onLanguage:markdown`), not lazily on the first
 * contributed command.
 *
 * Why this matters: several pieces wire up *inside* `activate()` and produce
 * nothing on disk for VS Code to pick up beforehand:
 *
 *   * `registerTimestampAdjustableContext` -- sets the
 *     `markdown-org.timestampAdjustable` when-context that gates
 *     `Shift+Up` / `Shift+Down`. Without activation, the context is `false`
 *     and the keystroke falls through to `cursorUpSelect` /
 *     `cursorDownSelect` instead of cycling DONE -> TODO, even though the
 *     caret is on a heading.
 *   * `registerBracketDiagnostics` -- the bracket-policy diagnostic source.
 *   * `registerGcalSaveTrigger` -- the optional debounced sync-on-save.
 *
 * VS Code only auto-activates an extension to fire one of its commands when
 * a keybinding resolves to that command -- but the `when` clause is checked
 * *before* activation, so a still-inactive extension can never set the
 * context that would let its own keybinding win. Hence the explicit
 * activation event below.
 *
 * This is a static manifest invariant, so it is a pure unit test.
 */
interface PackageJson {
    activationEvents?: string[];
}

function loadPackageJson(): PackageJson {
    // out/test/unit -> out/test -> out -> <root>/package.json
    const file = path.join(__dirname, '..', '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

suite('Extension: activationEvents contract', () => {
    const pkg = loadPackageJson();

    test('activates on markdown documents (so Shift+Up works on the first keystroke)', () => {
        const events = pkg.activationEvents ?? [];
        assert.ok(
            events.includes('onLanguage:markdown'),
            `activationEvents must include onLanguage:markdown so the timestampAdjustable ` +
                `when-context is seeded before the first Shift+Up. Got: ${JSON.stringify(events)}`
        );
    });
});
