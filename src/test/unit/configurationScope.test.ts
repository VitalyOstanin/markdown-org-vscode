import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

/**
 * Manifest invariant: the setting that names an executable is out of reach of
 * the repository being edited.
 *
 * `markdown-org.extractorPath` is passed straight to `execFile` when the
 * agenda opens or the calendar sync runs. Without an explicit `scope` the
 * setting defaults to `window`, so `.vscode/settings.json` inside a cloned
 * repository can point it at a binary that ships with that repository, and
 * opening the agenda runs it. `capabilities.untrustedWorkspaces` already
 * discards the value while the workspace is untrusted, but trust is granted
 * once, per repository, by a person who is answering a different question --
 * so the trusted case has to be closed in the manifest instead.
 *
 * `machine` accepts the value from user or machine settings only, which is
 * where a locally built extractor is configured anyway.
 *
 * This is a static manifest invariant, so it is a pure unit test.
 */
interface PackageJson {
    contributes?: {
        configuration?: {
            properties?: Record<string, { scope?: string }>;
        };
    };
}

function loadPackageJson(): PackageJson {
    // out/test/unit -> out/test -> out -> <root>/package.json
    const file = path.join(__dirname, '..', '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

suite('Extension: configuration scope contract', () => {
    const pkg = loadPackageJson();
    const properties = pkg.contributes?.configuration?.properties ?? {};

    test('extractorPath is machine-scoped (a repository cannot name the binary that gets run)', () => {
        const property = properties['markdown-org.extractorPath'];
        assert.ok(property, 'expected markdown-org.extractorPath to be a contributed setting');
        assert.strictEqual(
            property.scope,
            'machine',
            `markdown-org.extractorPath must declare "scope": "machine" so a workspace ` +
                `settings file cannot pick the executable. Got: ${JSON.stringify(property.scope)}`
        );
    });
});
