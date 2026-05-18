import * as assert from 'assert';
import { TAG_ALL, computeNextTag } from '../utils/cycleTag';

suite('computeNextTag', () => {
    test('ALL advances to the first configured tag', () => {
        assert.strictEqual(computeNextTag(TAG_ALL, ['work', 'home']), 'work');
    });

    test('a middle tag advances to the next configured tag', () => {
        assert.strictEqual(computeNextTag('work', ['work', 'home']), 'home');
    });

    test('the last configured tag wraps back to ALL, not to the first tag', () => {
        // Regression: cycleTag used to wrap fileTags directly, so "home" went
        // to "work" and the user could never return to ALL via the cycle.
        assert.strictEqual(computeNextTag('home', ['work', 'home']), TAG_ALL);
    });

    test('an unknown current tag falls back to ALL', () => {
        // Regression: previous implementation (`findIndex(...) + 1) % length`)
        // mapped -1 onto fileTags[0], silently jumping to the first tag.
        assert.strictEqual(computeNextTag('archived', ['work', 'home']), TAG_ALL);
    });

    test('single-tag rotation flips between ALL and the tag', () => {
        assert.strictEqual(computeNextTag(TAG_ALL, ['only']), 'only');
        assert.strictEqual(computeNextTag('only', ['only']), TAG_ALL);
    });

    test('empty tag list still maps ALL to ALL (no-op cycle)', () => {
        // cycleTag short-circuits on empty fileTags before calling
        // computeNextTag, but the helper itself should still be well-defined.
        assert.strictEqual(computeNextTag(TAG_ALL, []), TAG_ALL);
        assert.strictEqual(computeNextTag('any', []), TAG_ALL);
    });

    test('an explicit ALL entry in fileTags is deduplicated, not visited twice', () => {
        // The default settings ship with fileTags including an ALL entry.
        // Without dedup, cycle would be [ALL, ALL, WORK, ...] and ALL would
        // advance to itself, breaking the rotation. Regression for the
        // integration tests that pin baseFileTags = [ALL, WORK, PERSONAL].
        assert.strictEqual(computeNextTag(TAG_ALL, [TAG_ALL, 'WORK', 'PERSONAL']), 'WORK');
        assert.strictEqual(computeNextTag('WORK', [TAG_ALL, 'WORK', 'PERSONAL']), 'PERSONAL');
        assert.strictEqual(computeNextTag('PERSONAL', [TAG_ALL, 'WORK', 'PERSONAL']), TAG_ALL);
    });
});
