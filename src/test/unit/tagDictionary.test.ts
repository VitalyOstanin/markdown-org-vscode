import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { fileMatchesTag, mergeTagDictionaries } from '../../utils/tagDictionary';
import type { MergedTag, TagDeclaration } from '../../utils/tagDictionary';

const WORK: TagDeclaration = {
    directory: '/notes/work',
    tags: [
        { name: 'ALL', pattern: '' },
        { name: 'TASKS', pattern: 'task' },
        { name: 'OTHER', pattern: '!' }
    ]
};

const HOME: TagDeclaration = {
    directory: '/notes/home',
    tags: [
        { name: 'ALL', pattern: '' },
        { name: 'BILLS', pattern: 'bill' }
    ]
};

function tagNamed(dictionary: readonly MergedTag[], name: string): MergedTag {
    const found = dictionary.find((tag) => tag.name === name);
    assert.ok(found, `no tag named ${name} in ${dictionary.map((tag) => tag.name).join(', ')}`);
    return found;
}

suite('Tag dictionary merge', () => {
    test('a tag declared in one directory applies to every directory', () => {
        const dictionary = mergeTagDictionaries([WORK, HOME]);
        const tasks = tagNamed(dictionary, 'TASKS');

        // The note is in the directory that never heard of TASKS. The
        // dictionary is shared, so the tag reaches it all the same.
        assert.strictEqual(fileMatchesTag('task-repair.md', tasks, dictionary), true);
        assert.strictEqual(fileMatchesTag('bill-water.md', tasks, dictionary), false);
    });

    test('two directories disagreeing about a name keep both patterns', () => {
        const dictionary = mergeTagDictionaries([
            { directory: '/notes/work', tags: [{ name: 'DRAFT', pattern: 'wip' }] },
            { directory: '/notes/home', tags: [{ name: 'DRAFT', pattern: 'draft' }] }
        ]);
        const draft = tagNamed(dictionary, 'DRAFT');

        assert.deepStrictEqual(draft.include, ['wip', 'draft']);
        assert.strictEqual(fileMatchesTag('wip-letter.md', draft, dictionary), true);
        assert.strictEqual(fileMatchesTag('draft-letter.md', draft, dictionary), true);
        assert.strictEqual(fileMatchesTag('letter.md', draft, dictionary), false);
    });

    test('every declaration is kept as an origin, repeats included', () => {
        const dictionary = mergeTagDictionaries([WORK, HOME]);

        assert.deepStrictEqual(tagNamed(dictionary, 'ALL').origins, [
            { pattern: '', role: 'include', directory: '/notes/work' },
            { pattern: '', role: 'include', directory: '/notes/home' }
        ]);
        // The pattern itself is stored once even though two directories asked
        // for it: the tag matches by it either way, and the tag screen reads
        // `origins` for who wanted it.
        assert.deepStrictEqual(tagNamed(dictionary, 'ALL').include, ['']);
    });

    test('an empty pattern anywhere makes the whole tag show everything', () => {
        const dictionary = mergeTagDictionaries([
            { directory: '/notes/work', tags: [{ name: 'ALL', pattern: 'work' }] },
            { directory: '/notes/home', tags: [{ name: 'ALL', pattern: '' }] }
        ]);

        assert.strictEqual(fileMatchesTag('anything.md', tagNamed(dictionary, 'ALL'), dictionary), true);
    });

    test('the rest is measured against every tag of the dictionary', () => {
        const dictionary = mergeTagDictionaries([WORK, HOME]);
        const other = tagNamed(dictionary, 'OTHER');

        // `bill` was declared by the other directory, and it still keeps the
        // note out of OTHER: "everything else" spans the shared dictionary.
        assert.strictEqual(fileMatchesTag('bill-water.md', other, dictionary), false);
        assert.strictEqual(fileMatchesTag('task-repair.md', other, dictionary), false);
        // ALL is in this dictionary and takes every file, which must not empty
        // the rest: a tag that keeps nothing out tells no files apart.
        assert.strictEqual(fileMatchesTag('letter.md', other, dictionary), true);
    });

    test('the order of the directories does not change what a tag selects', () => {
        const one = mergeTagDictionaries([WORK, HOME]);
        const other = mergeTagDictionaries([HOME, WORK]);
        const files = ['task-repair.md', 'bill-water.md', 'letter.md'];

        for (const name of ['TASKS', 'BILLS', 'OTHER']) {
            const selectedOne = files.filter((file) => fileMatchesTag(file, tagNamed(one, name), one));
            const selectedOther = files.filter((file) => fileMatchesTag(file, tagNamed(other, name), other));
            assert.deepStrictEqual(selectedOne, selectedOther, `tag ${name} selects differently after reordering`);
        }
    });

    test('entries a file could hold but a tag cannot use are dropped', () => {
        const dictionary = mergeTagDictionaries([
            {
                directory: '/notes/work',
                tags: [
                    { name: '', pattern: 'nameless' },
                    { name: 'GOOD', pattern: 'good' },
                    ...([{ name: 'BROKEN' }, { pattern: 'orphan' }, { name: 42, pattern: 'wrong' }] as never[])
                ]
            }
        ]);

        assert.deepStrictEqual(
            dictionary.map((tag) => tag.name),
            ['GOOD']
        );
    });

    test('no declarations means no tags rather than an error', () => {
        assert.deepStrictEqual(mergeTagDictionaries([]), []);
    });
});

suite('Tag dictionary: including and excluding', () => {
    test('an exclusion keeps a file out of a tag that includes it', () => {
        const dictionary = mergeTagDictionaries([
            { directory: '/notes/work', tags: [{ name: 'WORK', include: ['work'], exclude: ['archive'] }] }
        ]);
        const work = tagNamed(dictionary, 'WORK');

        assert.strictEqual(fileMatchesTag('work-plan.md', work, dictionary), true);
        assert.strictEqual(fileMatchesTag('work-archive.md', work, dictionary), false);
    });

    test('an exclusion declared by one directory holds against the others', () => {
        // The two say opposite things about the same name on purpose: this is
        // the case the rule "excluding wins" exists for.
        const dictionary = mergeTagDictionaries([
            { directory: '/notes/work', tags: [{ name: 'WORK', include: ['work'] }] },
            { directory: '/notes/home', tags: [{ name: 'WORK', exclude: ['work-archive'] }] }
        ]);
        const work = tagNamed(dictionary, 'WORK');

        assert.strictEqual(fileMatchesTag('work-plan.md', work, dictionary), true);
        assert.strictEqual(fileMatchesTag('work-archive.md', work, dictionary), false);
    });

    test('an exclusion applies to a tag that takes everything', () => {
        const dictionary = mergeTagDictionaries([
            { directory: '/notes/work', tags: [{ name: 'ALL', pattern: '' }] },
            { directory: '/notes/home', tags: [{ name: 'ALL', exclude: ['secret'] }] }
        ]);
        const all = tagNamed(dictionary, 'ALL');

        assert.strictEqual(fileMatchesTag('anything.md', all, dictionary), true);
        assert.strictEqual(fileMatchesTag('secret-plan.md', all, dictionary), false);
    });

    test('a file excluded from a tag falls to the tag taking the rest', () => {
        const dictionary = mergeTagDictionaries([
            {
                directory: '/notes/work',
                tags: [
                    { name: 'WORK', include: ['work'], exclude: ['archive'] },
                    { name: 'OTHER', pattern: '!' }
                ]
            }
        ]);
        const other = tagNamed(dictionary, 'OTHER');

        // WORK refused it, so no tag claimed it -- and that is what the rest
        // is. Read as "matches no including pattern", this note would be in
        // nothing at all and invisible under every filter.
        assert.strictEqual(fileMatchesTag('work-archive.md', other, dictionary), true);
        assert.strictEqual(fileMatchesTag('work-plan.md', other, dictionary), false);
    });

    test('the two spellings of one tag merge into one', () => {
        const dictionary = mergeTagDictionaries([
            { directory: '/notes/work', tags: [{ name: 'WORK', pattern: 'work' }] },
            { directory: '/notes/home', tags: [{ name: 'WORK', include: ['job'], exclude: ['old'] }] }
        ]);
        const work = tagNamed(dictionary, 'WORK');

        assert.deepStrictEqual(work.include, ['work', 'job']);
        assert.deepStrictEqual(work.exclude, ['old']);
        assert.strictEqual(fileMatchesTag('job-plan.md', work, dictionary), true);
        assert.strictEqual(fileMatchesTag('job-old.md', work, dictionary), false);
    });

    test('an excluding pattern does not count as a claim on the file', () => {
        const dictionary = mergeTagDictionaries([
            {
                directory: '/notes/work',
                tags: [
                    { name: 'WORK', exclude: ['draft'] },
                    { name: 'OTHER', pattern: '!' }
                ]
            }
        ]);

        // WORK includes nothing, so it claims nothing, and the rest takes the
        // note it named in its exclusions like any other.
        assert.strictEqual(fileMatchesTag('draft-letter.md', tagNamed(dictionary, 'OTHER'), dictionary), true);
    });
});
