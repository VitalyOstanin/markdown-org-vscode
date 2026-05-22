import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { suite, before, beforeEach, after, test } from 'mocha';
import { extractor } from '../../utils/extractor';
import { bundledBinaryName, findBundledBinary } from '../../utils/bundledBinary';

const execFileAsync = promisify(execFile);

/**
 * Smoke-test the bundled markdown-org-extract shipped in the VSIX. Skips
 * itself when `bin/<binary>` is absent so a fresh developer checkout that
 * did not run `npm run prepare-bin` still has a green test run.
 */
suite('Extractor: bundled binary smoke', () => {
    // Repo root: integration tests run from out/test/integration/, so two
    // levels up is `out/`; one more up is the repo root that hosts `bin/`.
    const repoRoot = path.resolve(__dirname, '..', '..', '..');

    let originalExtractorPath: string | undefined;

    before(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        originalExtractorPath = config.get<string>('extractorPath');
        await config.update('extractorPath', '', vscode.ConfigurationTarget.Workspace);
    });

    after(async () => {
        const config = vscode.workspace.getConfiguration('markdown-org');
        await config.update('extractorPath', originalExtractorPath ?? '', vscode.ConfigurationTarget.Workspace);
    });

    beforeEach(function () {
        const candidate = path.join(repoRoot, 'bin', bundledBinaryName(process.platform));
        if (!fs.existsSync(candidate)) {
            // No bundled binary in dev checkout -- the per-target download
            // step lives in CI's release.yml, not in the local build. Skip
            // cleanly instead of failing.
            this.skip();
        }
    });

    test('findBundledBinary returns the path inside bin/', () => {
        const bundled = findBundledBinary(repoRoot, process.platform);
        assert.ok(bundled, 'expected bundled binary to be found');
        assert.strictEqual(bundled, path.join(repoRoot, 'bin', bundledBinaryName(process.platform)));
    });

    test('bundled binary executes and reports a version', async () => {
        const bundled = findBundledBinary(repoRoot, process.platform);
        assert.ok(bundled);
        const { stdout } = await execFileAsync(bundled, ['--version'], { timeout: 5_000 });
        // Format: `markdown-org-extract <version>`. Match leniently; the
        // exact version comes from the extractor release the VSIX is built
        // against and is asserted separately below.
        assert.match(stdout.trim(), /^markdown-org-extract\s+\d+\.\d+\.\d+/);
    });

    test('bundled binary version matches package.json x-markdown-org.extractorVersion', async () => {
        const bundled = findBundledBinary(repoRoot, process.platform);
        assert.ok(bundled);
        const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
        const expectedVersion: string = pkg['x-markdown-org']?.extractorVersion;
        assert.ok(expectedVersion, 'package.json must declare x-markdown-org.extractorVersion');

        const { stdout } = await execFileAsync(bundled, ['--version'], { timeout: 5_000 });
        assert.ok(
            stdout.trim().endsWith(expectedVersion),
            `expected '${stdout.trim()}' to end with '${expectedVersion}'`
        );
    });

    test('resolveExtractorPath returns the bundled binary when extractorPath setting is empty', async () => {
        const resolved = await extractor.resolveExtractorPath();
        assert.ok(resolved, 'expected resolveExtractorPath to return a path');
        assert.strictEqual(
            resolved,
            path.join(repoRoot, 'bin', bundledBinaryName(process.platform)),
            'expected the bundled binary, not a PATH fallback'
        );
    });
});
