import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

/**
 * Manifest invariant: the declared minimum host is a host that has the API
 * members this extension calls.
 *
 * The git status chain (ADR-0016) calls `api.getRepositoryRoot`, which the
 * built-in Git extension declares from 1.101 onwards -- 1.85, 1.90 and 1.99
 * ship `getRepository`, `openRepository` and `init` and nothing else. The
 * member is reached through the hand-written slice in
 * `src/utils/git/gitApiTypes.ts`, so `tsc` cannot notice the gap: it type-checks
 * against our own declaration, not against the host's. Hence a test over the
 * manifest.
 *
 * `@types/vscode` is pinned to that same minimum rather than a caret range, so
 * the API surface the code compiles against is the one the manifest promises.
 *
 * This is a static manifest invariant, so it is a pure unit test.
 */
const MINIMUM_HOST = '1.101.0';

interface PackageJson {
    engines?: { vscode?: string };
    devDependencies?: Record<string, string>;
}

function loadPackageJson(): PackageJson {
    // out/test/unit -> out/test -> out -> <root>/package.json
    const file = path.join(__dirname, '..', '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

suite('Extension: engine version contract', () => {
    const pkg = loadPackageJson();

    test('engines.vscode is at least the release that declares getRepositoryRoot', () => {
        assert.strictEqual(
            pkg.engines?.vscode,
            `^${MINIMUM_HOST}`,
            `engines.vscode must be ^${MINIMUM_HOST}: the git status chain calls ` +
                `api.getRepositoryRoot, absent from the Git extension API before ${MINIMUM_HOST}`
        );
    });

    test('@types/vscode is pinned to that exact minimum, not a caret range', () => {
        assert.strictEqual(
            pkg.devDependencies?.['@types/vscode'],
            MINIMUM_HOST,
            `@types/vscode must be exactly ${MINIMUM_HOST} so the code compiles against the ` +
                `API surface the manifest promises`
        );
    });
});
