import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildHelpSections, searchHelp } from '../../utils/helpIndex';

const PAGES = [
    {
        name: '02-repeaters',
        markdown:
            '# Repeating tasks\n\n' +
            'A repeater plans the next occurrence.\n\n' +
            '## Moving one occurrence\n\n' +
            'A `MOVED` line holds the day it was moved to.\n\n' +
            '## Cancelling one occurrence\n\n' +
            'An `EXDATE` line drops the day.\n'
    },
    {
        name: '01-tasks',
        markdown: '# Tasks\n\nA heading with `TODO` is a task.\n\n## Priorities\n\nA priority is a letter.\n'
    }
];

suite('Help index', () => {
    const sections = buildHelpSections(PAGES);

    test('sections come back in the order their file names give', () => {
        assert.deepStrictEqual(
            sections.map((section) => section.id),
            ['01-tasks', '02-repeaters']
        );
    });

    test('the title of a section is its own first heading', () => {
        assert.deepStrictEqual(
            sections.map((section) => section.title),
            ['Tasks', 'Repeating tasks']
        );
    });

    test('a page without a title falls back to its file name', () => {
        const [only] = buildHelpSections([{ name: '09-stub', markdown: 'Nothing but a line.\n' }]);
        assert.strictEqual(only?.title, '09-stub');
    });

    test('search finds the line and names the heading it sits under', () => {
        const [hit, ...rest] = searchHelp(sections, 'EXDATE');
        assert.deepStrictEqual(rest, []);
        assert.strictEqual(hit?.sectionId, '02-repeaters');
        assert.strictEqual(hit.headingText, 'Cancelling one occurrence');
        assert.strictEqual(hit.slug, 'cancelling-one-occurrence');
        assert.strictEqual(hit.line, 'An EXDATE line drops the day.');
    });

    test('a line above the first heading is tied to the page title', () => {
        const [hit] = searchHelp(sections, 'plans the next');
        assert.strictEqual(hit?.headingText, 'Repeating tasks');
        assert.strictEqual(hit.slug, 'repeating-tasks');
    });

    test('search ignores case and matches inside a word', () => {
        assert.strictEqual(searchHelp(sections, 'prioriti').length, 1);
        assert.strictEqual(searchHelp(sections, 'PRIORITY').length, 1);
    });

    test('a term that appears in no page finds nothing, and neither does a blank one', () => {
        assert.deepStrictEqual(searchHelp(sections, 'clocktable'), []);
        assert.deepStrictEqual(searchHelp(sections, '   '), []);
    });

    test('the number of hits is capped', () => {
        const many = buildHelpSections([
            { name: '01-many', markdown: '# Many\n\n' + Array.from({ length: 30 }, () => 'the word\n\n').join('') }
        ]);
        assert.strictEqual(searchHelp(many, 'the word', 5).length, 5);
    });

    test('a heading matches as text, so the search reaches the titles too', () => {
        const hits = searchHelp(sections, 'Moving one');
        assert.strictEqual(hits[0]?.headingText, 'Moving one occurrence');
    });
});
