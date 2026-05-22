import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import { bundledBinaryName, findBundledBinary } from '../../utils/bundledBinary';

suite('extractor: bundled binary lookup', () => {
    let tmpRoot: string;

    suiteSetup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-org-bundled-'));
    });

    suiteTeardown(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    test('bundledBinaryName returns plain name on Unix', () => {
        assert.strictEqual(bundledBinaryName('linux'), 'markdown-org-extract');
        assert.strictEqual(bundledBinaryName('darwin'), 'markdown-org-extract');
    });

    test('bundledBinaryName returns .exe on win32', () => {
        assert.strictEqual(bundledBinaryName('win32'), 'markdown-org-extract.exe');
    });

    test('findBundledBinary returns path when file exists and is executable', () => {
        // Per-test extension root so other tests cannot see the binary this
        // one stages.
        const extDir = path.join(tmpRoot, 'ok');
        const binDir = path.join(extDir, 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const binPath = path.join(binDir, 'markdown-org-extract');
        fs.writeFileSync(binPath, '#!/bin/sh\nexit 0\n');
        fs.chmodSync(binPath, 0o755);

        const result = findBundledBinary(extDir, 'linux');
        assert.strictEqual(result, binPath);
    });

    test('findBundledBinary returns undefined when bin directory is missing', () => {
        const extDir = path.join(tmpRoot, 'nobin');
        fs.mkdirSync(extDir, { recursive: true });

        const result = findBundledBinary(extDir, 'linux');
        assert.strictEqual(result, undefined);
    });

    test('findBundledBinary returns undefined when file exists but is not executable', () => {
        // On Windows fs.access(X_OK) checks file extension, not the +x bit,
        // so chmod 644 is not a reliable "not executable" signal there. Skip
        // when running on Windows -- the file-extension check is exercised
        // by the win32 case above.
        if (process.platform === 'win32') {
            return;
        }
        const extDir = path.join(tmpRoot, 'noexec');
        const binDir = path.join(extDir, 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const binPath = path.join(binDir, 'markdown-org-extract');
        fs.writeFileSync(binPath, '#!/bin/sh\nexit 0\n');
        fs.chmodSync(binPath, 0o644);

        const result = findBundledBinary(extDir, 'linux');
        assert.strictEqual(result, undefined);
    });

    test('findBundledBinary looks for .exe on win32', () => {
        // Same staging as the happy path, but the lookup is asked to find
        // the win32 variant. The plain-name file should be ignored.
        const extDir = path.join(tmpRoot, 'win32');
        const binDir = path.join(extDir, 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const plainPath = path.join(binDir, 'markdown-org-extract');
        fs.writeFileSync(plainPath, '#!/bin/sh\nexit 0\n');
        fs.chmodSync(plainPath, 0o755);

        // No .exe present: should be undefined.
        assert.strictEqual(findBundledBinary(extDir, 'win32'), undefined);

        // Once .exe is added, should be returned. On Linux runners X_OK
        // requires +x; on Windows the extension is the executable signal.
        const exePath = path.join(binDir, 'markdown-org-extract.exe');
        fs.writeFileSync(exePath, '');
        fs.chmodSync(exePath, 0o755);
        assert.strictEqual(findBundledBinary(extDir, 'win32'), exePath);
    });
});
