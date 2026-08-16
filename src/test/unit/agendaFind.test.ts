import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { findCommandSequence, runFindSequence } from '../../utils/agendaFindCommands';

suite('agenda find repeat', () => {
    test('reveals the widget before stepping, so a dismissed one is reopened', () => {
        assert.deepStrictEqual(findCommandSequence('next'), [
            'editor.action.webvieweditor.showFind',
            'editor.action.webvieweditor.findNext'
        ]);
    });

    test('Shift+F3 walks the same widget the other way', () => {
        assert.deepStrictEqual(findCommandSequence('previous'), [
            'editor.action.webvieweditor.showFind',
            'editor.action.webvieweditor.findPrevious'
        ]);
    });

    test('runs the sequence in order, one command at a time', async () => {
        const seen: string[] = [];
        // Each fake command resolves on a later tick: revealing the widget and
        // stepping through it are two commands in the editor, and the step
        // must not be issued before the reveal has been served.
        await runFindSequence('next', async (command) => {
            seen.push(command);
            await Promise.resolve();
            seen.push(`${command} done`);
        });
        assert.deepStrictEqual(seen, [
            'editor.action.webvieweditor.showFind',
            'editor.action.webvieweditor.showFind done',
            'editor.action.webvieweditor.findNext',
            'editor.action.webvieweditor.findNext done'
        ]);
    });
});
