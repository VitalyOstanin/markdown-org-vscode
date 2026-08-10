import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { mergeTagDictionaries } from '../../utils/tagDictionary';
import { renderTagDictionaryReport } from '../../utils/tagDictionaryReport';

suite('The report explaining the tags', () => {
    test('names every pattern of a tag and the directory that asked for it', () => {
        const report = renderTagDictionaryReport(
            mergeTagDictionaries([
                { directory: '/notes/work', tags: [{ name: 'WORK', include: ['work'], exclude: ['archive'] }] },
                { directory: '/notes/home', tags: [{ name: 'WORK', pattern: 'job' }] }
            ])
        );

        assert.match(report, /## WORK/);
        assert.match(report, /takes notes whose name holds "work" — declared by \/notes\/work/);
        assert.match(report, /keeps out notes whose name holds "archive" — declared by \/notes\/work/);
        assert.match(report, /takes notes whose name holds "job" — declared by \/notes\/home/);
    });

    test('the settings are named as such rather than as an empty path', () => {
        const report = renderTagDictionaryReport(
            mergeTagDictionaries([{ directory: '', tags: [{ name: 'ALL', pattern: '' }] }])
        );

        assert.match(report, /takes every note — declared by settings/);
        assert.doesNotMatch(report, /declared by\s*$/m);
    });

    test('a resting tag says what it takes', () => {
        const report = renderTagDictionaryReport(
            mergeTagDictionaries([{ directory: '/notes', tags: [{ name: 'OTHER', pattern: '!work' }] }])
        );

        assert.match(report, /takes what no other tag takes — declared by \/notes/);
    });

    test('a tag that both takes and refuses says which wins', () => {
        const report = renderTagDictionaryReport(
            mergeTagDictionaries([
                { directory: '/notes', tags: [{ name: 'WORK', include: ['work'], exclude: ['old'] }] }
            ])
        );

        assert.match(report, /Keeping out wins over taking in/);
    });

    test('an empty dictionary says where tags would come from', () => {
        const report = renderTagDictionaryReport([]);

        assert.match(report, /No tags are declared/);
        assert.match(report, /\.markdown-org\/tags\.json/);
        assert.match(report, /markdown-org\.fileTags/);
    });
});
