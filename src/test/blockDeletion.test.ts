import * as assert from 'assert';
import { computeBlockDeletionCoords, MinDocument } from '../utils/blockDeletion';

function fakeDocument(lineCount: number, lengths: Record<number, number> = {}): MinDocument {
    return {
        lineCount,
        getLineLength: (lineIndex: number) => lengths[lineIndex] ?? 0
    };
}

suite('computeBlockDeletionCoords', () => {
    test('block in the middle ends at the start of the line after the block', () => {
        // lineCount=10, start=2, contentLength=3 -> lastIdx=4 (not EOF)
        const c = computeBlockDeletionCoords(fakeDocument(10), 2, 3);
        assert.deepStrictEqual(c, { startLine: 2, startCharacter: 0, endLine: 5, endCharacter: 0 });
    });

    test('block reaching the last line of a file with trailing newline still closes on end-of-last-line', () => {
        // With a trailing newline the document has an extra empty line, so
        // touching the previous-to-last line still hits the EOF branch.
        // lineCount=5, start=2, contentLength=3 -> lastIdx=4 == lineCount-1
        const c = computeBlockDeletionCoords(fakeDocument(5, { 4: 7 }), 2, 3);
        assert.deepStrictEqual(c, { startLine: 2, startCharacter: 0, endLine: 4, endCharacter: 7 });
    });

    test('block reaching the last line of a file without trailing newline closes on end-of-last-line', () => {
        // Regression for the bug fixed in moveToArchive: previously the
        // delete range ended at Position(lineCount, 0), which does not exist,
        // and VS Code silently left the last line behind.
        // lineCount=4, start=1, contentLength=3 -> lastIdx=3 == lineCount-1
        const c = computeBlockDeletionCoords(fakeDocument(4, { 3: 10 }), 1, 3);
        assert.deepStrictEqual(c, { startLine: 1, startCharacter: 0, endLine: 3, endCharacter: 10 });
    });

    test('contentLength larger than remaining lines still clamps to actual last line', () => {
        // lineCount=3, start=0, contentLength=10 -> lastIdx=9 (way past EOF)
        const c = computeBlockDeletionCoords(fakeDocument(3, { 2: 5 }), 0, 10);
        assert.deepStrictEqual(c, { startLine: 0, startCharacter: 0, endLine: 2, endCharacter: 5 });
    });

    test('single-line block in the middle deletes one line', () => {
        const c = computeBlockDeletionCoords(fakeDocument(5), 1, 1);
        assert.deepStrictEqual(c, { startLine: 1, startCharacter: 0, endLine: 2, endCharacter: 0 });
    });

    test('single-line block on the last line closes on end-of-last-line', () => {
        // lineCount=3, start=2, contentLength=1 -> lastIdx=2 == lineCount-1
        const c = computeBlockDeletionCoords(fakeDocument(3, { 2: 8 }), 2, 1);
        assert.deepStrictEqual(c, { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 8 });
    });

    test('empty last line returns endCharacter=0', () => {
        const c = computeBlockDeletionCoords(fakeDocument(3, { 2: 0 }), 1, 2);
        assert.deepStrictEqual(c, { startLine: 1, startCharacter: 0, endLine: 2, endCharacter: 0 });
    });
});
