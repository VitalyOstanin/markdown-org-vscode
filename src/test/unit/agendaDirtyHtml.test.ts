import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { dirtyChipTitle, dirtyCount, renderDirtyMenu } from '../../utils/agendaDirtyHtml';
import type { DirtyHtmlContext } from '../../utils/agendaDirtyHtml';
import { AGENDA_STRINGS, formatString, pluralIndex } from '../../utils/agendaI18n';
import { escapeHtml } from '../../utils/agendaEscapeHtml';
import { formatNumber } from '../../utils/formatNumber';
import type { AgendaDirtyStatus, DirtyFileState } from '../../types';

const CTX: DirtyHtmlContext = {
    dirty: AGENDA_STRINGS.en.dirty,
    locale: 'en-US',
    uiLang: 'en',
    escapeHtml,
    formatString,
    formatNumber,
    pluralIndex
};

function file(partial: Partial<DirtyFileState> & { file: string }): DirtyFileState {
    return { label: partial.file, ...partial };
}

function status(files: DirtyFileState[]): AgendaDirtyStatus {
    return { files };
}

suite('dirtyCount', () => {
    test('picks the singular and plural forms English carries', () => {
        assert.strictEqual(dirtyCount(1, CTX), '1 file');
        assert.strictEqual(dirtyCount(3, CTX), '3 files');
    });
});

suite('dirtyChipTitle', () => {
    test('names the count the chip shows', () => {
        assert.strictEqual(dirtyChipTitle(status([file({ file: '/notes.md' })]), CTX), 'Unsaved: 1 file');
    });
});

suite('renderDirtyMenu', () => {
    test('renders nothing with no dirty file in view', () => {
        assert.strictEqual(renderDirtyMenu(status([]), CTX), '');
    });

    test('renders the chip, a row per file and the save action', () => {
        const html = renderDirtyMenu(
            status([
                file({ file: '/repo/notes.md', label: 'notes.md' }),
                file({ file: '/repo/todo.md', label: 'todo.md' })
            ]),
            CTX
        );

        assert.match(html, /id="dirtyMenuBtn"/);
        assert.match(html, /Unsaved: 2 files/);
        assert.match(html, /data-file="\/repo\/notes\.md"/);
        assert.match(html, /data-file="\/repo\/todo\.md"/);
        assert.match(html, /notes\.md/);
        assert.match(html, /id="dirtySaveBtn"/);
        assert.match(html, /Save 2 files/);
    });

    test('escapes a path that carries markup', () => {
        const html = renderDirtyMenu(status([file({ file: '/repo/<script>.md', label: '<script>.md' })]), CTX);

        assert.doesNotMatch(html, /<script>\.md<\/span>/);
        assert.match(html, /&lt;script&gt;\.md/);
    });
});
