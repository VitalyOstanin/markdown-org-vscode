import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

/**
 * The group menu acts from the panel, so every notice it raises is written in
 * the panel's language (ADR-0019). The success and the "nothing to do" answer
 * come from the dictionary; the file-write failure used to be an English
 * literal, which came out beside a Russian success from the same press.
 *
 * Read off the source rather than driven through the command: the module
 * imports `vscode`, and what has to hold is that no notice is spelled out here
 * at all.
 */
suite('the notices of a group action', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'src', 'commands', 'groupActions.ts'),
        'utf8'
    );

    test('no notice is spelled out in the file that raises it', () => {
        const literal = /notify(?:Error|Status|Info)\(\s*[`'"]/.exec(source);
        assert.equal(literal, null, `a notice written in place: ${literal?.[0] ?? ''}`);
    });

    test('the failure is announced through the dictionary', () => {
        assert.ok(
            source.includes('strings.group.failed'),
            'the write failure does not read its wording from the strings'
        );
    });
});
