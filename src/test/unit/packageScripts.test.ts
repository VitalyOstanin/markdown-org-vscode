import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

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
