import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, setup, teardown, test } from 'mocha';
import { SETTINGS_ORIGIN, TAGS_FILE, readTagDeclarations } from '../../utils/tagSources';

suite('Reading the tags a directory declares', () => {
    let tmpRoot: string;

    function notesDir(name: string, tagsFileContent?: string): string {
        const directory = path.join(tmpRoot, name);
        fs.mkdirSync(directory, { recursive: true });
        if (tagsFileContent !== undefined) {
            const file = path.join(directory, TAGS_FILE);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, tagsFileContent, 'utf8');
        }
        return directory;
    }

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-org-tags-'));
    });

    teardown(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    test('a directory carrying a tags file declares what it holds', async () => {
        const work = notesDir('work', JSON.stringify([{ name: 'WORK', pattern: 'work' }]));

        const declarations = await readTagDeclarations([work], []);

        assert.deepStrictEqual(declarations, [{ directory: work, tags: [{ name: 'WORK', pattern: 'work' }] }]);
    });

    test('a directory without the file declares nothing, which is not an error', async () => {
        const declarations = await readTagDeclarations([notesDir('bare')], []);

        assert.deepStrictEqual(declarations, []);
    });

    test('a tags file that cannot be read at all is reported, unlike an absent one', async () => {
        // A missing file is the ordinary case and says nothing. A file that is
        // there but unreadable -- a directory in its place, or one the user
        // cannot open -- is a dictionary the agenda is silently filtering
        // without, so the reason is passed to the caller.
        const directory = path.join(tmpRoot, 'locked');
        fs.mkdirSync(path.join(directory, TAGS_FILE), { recursive: true });
        const skipped: string[] = [];

        const declarations = await readTagDeclarations([directory], [], (message) => skipped.push(message));

        assert.deepStrictEqual(declarations, []);
        assert.strictEqual(skipped.length, 1, `expected one report, got ${JSON.stringify(skipped)}`);
        assert.ok(skipped[0]?.includes('unreadable'), skipped[0]);
    });

    test('the settings are a source beside the files, not instead of them', async () => {
        const work = notesDir('work', JSON.stringify([{ name: 'WORK', pattern: 'work' }]));

        const declarations = await readTagDeclarations([work], [{ name: 'ALL', pattern: '' }]);

        assert.deepStrictEqual(
            declarations.map((declaration) => declaration.directory),
            [work, SETTINGS_ORIGIN]
        );
    });

    test('a file that will not parse is skipped and the others still count', async () => {
        const broken = notesDir('broken', '{ this is not json');
        const good = notesDir('good', JSON.stringify([{ name: 'GOOD', pattern: 'good' }]));

        const declarations = await readTagDeclarations([broken, good], []);

        assert.deepStrictEqual(
            declarations.map((declaration) => declaration.directory),
            [good]
        );
    });

    test('a file holding something other than a list is skipped', async () => {
        const shaped = notesDir('shaped', JSON.stringify({ tags: [{ name: 'WORK', pattern: 'work' }] }));

        assert.deepStrictEqual(await readTagDeclarations([shaped], []), []);
    });

    test('the order of the declarations follows the order of the directories', async () => {
        const one = notesDir('one', JSON.stringify([{ name: 'ONE', pattern: '1' }]));
        const two = notesDir('two', JSON.stringify([{ name: 'TWO', pattern: '2' }]));

        const declarations = await readTagDeclarations([two, one], []);

        assert.deepStrictEqual(
            declarations.map((declaration) => declaration.directory),
            [two, one]
        );
    });
});
