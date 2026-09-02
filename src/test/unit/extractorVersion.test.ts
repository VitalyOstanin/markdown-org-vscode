import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { compareVersions, extractorVersionWarning, parseExtractorVersion } from '../../utils/extractorVersion';

suite('parseExtractorVersion', () => {
    test('reads the version out of the --version line', () => {
        assert.strictEqual(parseExtractorVersion('markdown-org-extract 0.11.0\n'), '0.11.0');
        assert.strictEqual(parseExtractorVersion('markdown-org-extract 1.2.3'), '1.2.3');
    });

    test('unrecognised output yields undefined rather than a wrong version', () => {
        assert.strictEqual(parseExtractorVersion(''), undefined);
        assert.strictEqual(parseExtractorVersion('command not found'), undefined);
    });
});

suite('compareVersions', () => {
    test('orders by major, then minor, then patch', () => {
        assert.ok(compareVersions('0.10.0', '0.11.0') < 0);
        assert.ok(compareVersions('0.11.0', '0.11.0') === 0);
        // A string with no version in it sorts before every real one, so a
        // binary answering with something unreadable reads as too old rather
        // than as new enough.
        assert.ok(compareVersions('not a version', '0.1.0') < 0);
        assert.ok(compareVersions('1.0.0', '0.99.99') > 0);
        assert.ok(compareVersions('0.11.2', '0.11.10') < 0);
    });
});

suite('extractorVersionWarning', () => {
    test('an older binary is named in the warning together with the expected version', () => {
        const warning = extractorVersionWarning('0.10.0', '0.11.0');
        assert.ok(warning, 'expected a warning for an older binary');
        assert.ok(warning.includes('0.10.0'), warning);
        assert.ok(warning.includes('0.11.0'), warning);
    });

    test('an equal or newer binary produces no warning', () => {
        assert.strictEqual(extractorVersionWarning('0.11.0', '0.11.0'), undefined);
        assert.strictEqual(extractorVersionWarning('0.12.0', '0.11.0'), undefined);
    });

    test('an unknown version is not reported as outdated', () => {
        assert.strictEqual(extractorVersionWarning(undefined, '0.11.0'), undefined);
    });
});
