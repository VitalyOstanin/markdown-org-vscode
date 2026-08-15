import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'mocha';
import { resolveRealPath } from '../../utils/git/realPath';

suite('resolveRealPath', () => {
    test('a symlink resolves to what it points at', async () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-realpath-'));
        try {
            const real = path.join(base, 'work.md');
            const link = path.join(base, 'link.md');
            fs.writeFileSync(real, '# work\n');
            fs.symlinkSync(real, link);
            // Both sides through the same call on purpose: on Windows the temp
            // directory arrives as a short 8.3 name, and `fs.promises.realpath`
            // expands it while `fs.realpathSync` leaves it alone -- comparing
            // across the two would fail on the spelling, not on the symlink.
            assert.strictEqual(await resolveRealPath(link, new Map()), await fs.promises.realpath(real));
        } finally {
            fs.rmSync(base, { recursive: true, force: true });
        }
    });

    test('a file gone since the agenda was built keeps its own path', async () => {
        // The fallback is what keeps such a file in the "outside git" group
        // instead of aborting the whole status pass.
        const gone = path.join(os.tmpdir(), 'mo-realpath-missing-3fb2.md');
        assert.strictEqual(await resolveRealPath(gone, new Map()), gone);
    });

    test('the answer is remembered, including the fallback', async () => {
        const cache = new Map<string, string>();
        const gone = path.join(os.tmpdir(), 'mo-realpath-missing-91c4.md');
        await resolveRealPath(gone, cache);
        assert.strictEqual(cache.get(gone), gone);
    });

    test('a cached answer is returned without touching the file system', async () => {
        const cache = new Map<string, string>([['/asked/before', '/remembered']]);
        assert.strictEqual(await resolveRealPath('/asked/before', cache), '/remembered');
    });
});
