import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageJson {
    scripts?: Record<string, string>;
}

function loadPackageJson(): PackageJson {
    const file = path.join(__dirname, '..', '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

suite('package.json scripts', () => {
    const pkg = loadPackageJson();
    const scripts = pkg.scripts ?? {};

    test('test:watch runs the dedicated watch wrapper instead of `npm test` in a loop', () => {
        const watch = scripts['test:watch'];
        assert.ok(watch, 'test:watch script must exist for the unit-test feedback loop');
        assert.ok(
            watch.includes('scripts/test-watch.js'),
            `test:watch should call scripts/test-watch.js, got: ${watch}`
        );
    });

    test('test:integration delegates to the xvfb wrapper, not directly to runTest.js', () => {
        const integration = scripts['test:integration'];
        assert.ok(integration, 'test:integration script must exist');
        assert.ok(
            integration.includes('scripts/run-integration-tests.js'),
            `test:integration should call scripts/run-integration-tests.js to wrap with xvfb-run when available, got: ${integration}`
        );
    });
});

/**
 * The manifest promises that path-like settings are ignored in an untrusted
 * workspace. Until these are listed, that promise rests only on `isTrusted`
 * checks at the command entry points: any future command that forgets one runs
 * an executable whose path came from a cloned repository's `.vscode/settings.json`.
 */
suite('package.json workspace trust', () => {
    interface TrustCapabilities {
        capabilities?: {
            untrustedWorkspaces?: { supported?: string; restrictedConfigurations?: string[] };
        };
    }

    const manifest = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8')
    ) as TrustCapabilities;

    test('the path-like settings are restricted by the platform, not just by our own checks', () => {
        const restricted = manifest.capabilities?.untrustedWorkspaces?.restrictedConfigurations ?? [];
        for (const setting of [
            'markdown-org.extractorPath',
            'markdown-org.maintainFilePath',
            'markdown-org.workspaceDir',
            'markdown-org.workspaceDirs'
        ]) {
            assert.ok(restricted.includes(setting), `${setting} must be in restrictedConfigurations`);
        }
    });
});
