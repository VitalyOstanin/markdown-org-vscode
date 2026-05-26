import * as assert from 'assert';
import { suite, test } from 'mocha';
import { buildHeading } from '../../utils/buildHeading';

suite('buildHeading', () => {
    test('hashes and title only', () => {
        assert.strictEqual(buildHeading({ hashes: '##', title: 'Title' }), '## Title');
    });

    test('with status keyword', () => {
        assert.strictEqual(buildHeading({ hashes: '##', status: 'TODO', title: 'Title' }), '## TODO Title');
    });

    test('with priority wraps the bare value in [#...]', () => {
        assert.strictEqual(buildHeading({ hashes: '#', priority: 'A', title: 'Title' }), '# [#A] Title');
    });

    test('numeric priority is wrapped the same way', () => {
        assert.strictEqual(buildHeading({ hashes: '#', priority: '5', title: 'Title' }), '# [#5] Title');
    });

    test('status and priority together, in order', () => {
        assert.strictEqual(
            buildHeading({ hashes: '###', status: 'DONE', priority: 'B', title: 'Ship it' }),
            '### DONE [#B] Ship it'
        );
    });

    test('empty status is omitted (toggle-off removes the keyword)', () => {
        assert.strictEqual(buildHeading({ hashes: '##', status: '', priority: 'A', title: 'Title' }), '## [#A] Title');
    });

    test('empty priority is omitted (toggle-off removes the priority)', () => {
        assert.strictEqual(
            buildHeading({ hashes: '##', status: 'TODO', priority: '', title: 'Title' }),
            '## TODO Title'
        );
    });
});
