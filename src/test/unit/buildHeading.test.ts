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

    test('undefined status is omitted (toggle-off removes the keyword)', () => {
        assert.strictEqual(
            buildHeading({ hashes: '##', status: undefined, priority: 'A', title: 'Title' }),
            '## [#A] Title'
        );
    });

    test('a falsy empty-string status is still omitted at runtime (defensive guard)', () => {
        // The typed contract is TaskStatus | undefined, but buildHeading guards
        // with a falsy check, so a stray '' (cast in) is dropped like undefined.
        assert.strictEqual(
            buildHeading({ hashes: '##', status: '' as unknown as undefined, priority: 'A', title: 'Title' }),
            '## [#A] Title'
        );
    });

    test('empty priority is omitted (toggle-off removes the priority)', () => {
        assert.strictEqual(
            buildHeading({ hashes: '##', status: 'TODO', priority: '', title: 'Title' }),
            '## TODO Title'
        );
    });

    test('builds heading with CANCELLED status', () => {
        const out = buildHeading({ hashes: '###', status: 'CANCELLED', title: 'Foo' });
        assert.strictEqual(out, '### CANCELLED Foo');
    });

    test('builds heading with CANCELLED + priority', () => {
        const out = buildHeading({ hashes: '###', status: 'CANCELLED', priority: 'A', title: 'Foo' });
        assert.strictEqual(out, '### CANCELLED [#A] Foo');
    });
});
