import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildCollectionMarks, collectionMarkHtml, COLLECTION_TONES } from '../../utils/agendaCollections';

const ctx = {
    collectionTooltip: 'From {0}',
    escapeHtml: (value: string | number | boolean | undefined | null): string =>
        String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;'),
    formatString: (template: string, ...values: string[]): string =>
        template.replaceAll(/\{(\d+)\}/g, (_match, index: string) => values[Number(index)] ?? '')
};

suite('agendaCollections.buildCollectionMarks', () => {
    test('one directory needs no mark', () => {
        assert.deepStrictEqual(buildCollectionMarks(['/notes/work']), []);
        assert.deepStrictEqual(buildCollectionMarks([]), []);
    });

    test('each directory gets its own name and palette slot', () => {
        assert.deepStrictEqual(buildCollectionMarks(['/notes/work', '/notes/home']), [
            { root: '/notes/work', name: 'work', tone: 0 },
            { root: '/notes/home', name: 'home', tone: 1 }
        ]);
    });

    test('two directories with the same name are told apart by their parent', () => {
        assert.deepStrictEqual(buildCollectionMarks(['/a/notes', '/b/notes', '/c/tasks']), [
            { root: '/a/notes', name: 'a/notes', tone: 0 },
            { root: '/b/notes', name: 'b/notes', tone: 1 },
            { root: '/c/tasks', name: 'tasks', tone: 2 }
        ]);
    });

    test('a trailing separator and a Windows path name the same directory', () => {
        assert.deepStrictEqual(buildCollectionMarks(['/notes/work/', 'C:\\Users\\me\\home']), [
            { root: '/notes/work/', name: 'work', tone: 0 },
            { root: 'C:\\Users\\me\\home', name: 'home', tone: 1 }
        ]);
    });

    test('a root with no name of its own is labelled by the path itself', () => {
        // The filesystem root has no last segment to name it. An empty label
        // would draw a dot with nothing beside it and no way to tell which
        // directory the row came from.
        assert.deepStrictEqual(buildCollectionMarks(['/', '/notes/home']), [
            { root: '/', name: '/', tone: 0 },
            { root: '/notes/home', name: 'home', tone: 1 }
        ]);
    });

    test('the palette wraps round rather than running out', () => {
        const roots = Array.from({ length: COLLECTION_TONES + 2 }, (_value, index) => `/notes/${index}`);
        const tones = buildCollectionMarks(roots).map((mark) => mark.tone);
        assert.deepStrictEqual(tones.slice(0, COLLECTION_TONES), [...Array(COLLECTION_TONES).keys()]);
        assert.deepStrictEqual(tones.slice(COLLECTION_TONES), [0, 1]);
    });
});

suite('agendaCollections.collectionMarkHtml', () => {
    const marks = buildCollectionMarks(['/notes/work', '/notes/home']);

    test('the dot carries the tone and names its directory', () => {
        assert.strictEqual(
            collectionMarkHtml('/notes/home', marks, ctx),
            '<span class="collection" data-tone="1" title="From home"></span>'
        );
    });

    test('a row with no root — the single-directory case — carries nothing', () => {
        assert.strictEqual(collectionMarkHtml(undefined, marks, ctx), '');
        assert.strictEqual(collectionMarkHtml('', marks, ctx), '');
        assert.strictEqual(collectionMarkHtml('/notes/work', [], ctx), '');
    });

    test('a root the payload no longer lists leaves the row unmarked', () => {
        assert.strictEqual(collectionMarkHtml('/notes/archive', marks, ctx), '');
    });

    test('the directory name is escaped, since it lands inside an attribute', () => {
        const quoted = buildCollectionMarks(['/notes/a"b', '/notes/home']);
        assert.strictEqual(
            collectionMarkHtml('/notes/a"b', quoted, ctx),
            '<span class="collection" data-tone="0" title="From a&quot;b"></span>'
        );
    });
});
