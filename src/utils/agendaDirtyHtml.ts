/**
 * HTML for the "unsaved" chip in the agenda header.
 *
 * A source file open with edits not yet on disk is a file whose line numbers
 * the editor and the extractor can disagree about -- see collectDirtyStatus.ts
 * for why. This chip names it the way the git chip names an unpushed commit:
 * always in view while it applies, with an action that clears it.
 *
 * Same arrangement as the sibling `agenda*Html.ts` modules: the page runs in a
 * webview no coverage runner instruments, so the markup takes the dictionary
 * and the escaping/formatting helpers as parameters, and the unit suite covers
 * it directly. Inlined into the page through `Function.prototype.toString()`,
 * same as agendaGitHtml.ts -- no value imports, and every function this one
 * calls has to be inlined alongside it (see INLINED_HELPERS in agendaPanel.ts).
 *
 * The chip and its file rows reuse the git chip's own classes (`.tag-menu`,
 * `.git-file`, `.git-actions`, `.git-action`): both are a small dropdown with a
 * coloured count and a list of paths, and forking that shape for a second
 * concern would be a second stylesheet to keep in step with the first.
 */
import type { AgendaDirtyStatus, DirtyFileState } from '../types';
import type { EscapeHtml, FormatNumber, FormatString, PluralIndex } from './agendaSummaryHtml';
import type { AgendaStrings } from './agendaI18n';

export type DirtyStrings = AgendaStrings['dirty'];

/** What the chip and the list need beyond the status itself. */
export interface DirtyHtmlContext {
    dirty: DirtyStrings;
    locale: string;
    uiLang: string;
    escapeHtml: EscapeHtml;
    formatString: FormatString;
    formatNumber: FormatNumber;
    pluralIndex: PluralIndex;
}

/** `2 files` / `2 файла`: digits follow the date locale, the form the UI language. */
export function dirtyCount(n: number, ctx: DirtyHtmlContext): string {
    return `${ctx.formatNumber(n, ctx.locale)} ${ctx.dirty.files[ctx.pluralIndex(n, ctx.uiLang)] ?? ''}`;
}

/** Chip tooltip and dropdown caption: the same sentence either place asks it. */
export function dirtyChipTitle(status: AgendaDirtyStatus, ctx: DirtyHtmlContext): string {
    return ctx.formatString(ctx.dirty.title, dirtyCount(status.files.length, ctx));
}

/** One row of the dropdown list. */
export function dirtyFileRow(file: DirtyFileState, ctx: DirtyHtmlContext): string {
    const title = ctx.escapeHtml(ctx.formatString(ctx.dirty.openFileTitle, file.file));
    return (
        `<button type="button" class="git-file" data-file="${ctx.escapeHtml(file.file)}" title="${title}">` +
        `<span class="git-file-name">${ctx.escapeHtml(file.label)}</span></button>`
    );
}

/**
 * The whole dropdown: chip plus list, or nothing at all with no dirty file in
 * view. Rendered as one node, like the git menu, so the client can replace it
 * wholesale when the status changes without disturbing the rest of the header.
 */
export function renderDirtyMenu(status: AgendaDirtyStatus, ctx: DirtyHtmlContext): string {
    if (status.files.length === 0) {
        return '';
    }
    const title = ctx.escapeHtml(dirtyChipTitle(status, ctx));
    const rows = status.files.map((file) => dirtyFileRow(file, ctx)).join('');
    const saveLabel = ctx.escapeHtml(ctx.formatString(ctx.dirty.saveButton, dirtyCount(status.files.length, ctx)));
    const saveTitle = ctx.escapeHtml(ctx.dirty.saveButtonTitle);
    return (
        '<div class="tag-menu dirty-menu" id="dirtyMenu">' +
        `<button class="tag-menu-btn dirty-chip" id="dirtyMenuBtn" title="${title}" aria-label="${title}">` +
        `!<b>${ctx.escapeHtml(ctx.formatNumber(status.files.length, ctx.locale))}</b></button>` +
        '<div class="tag-menu-list dirty-menu-list">' +
        `<div class="tag-menu-label">${title}</div>` +
        rows +
        `<div class="git-actions"><button type="button" class="git-action" id="dirtySaveBtn" ` +
        `title="${saveTitle}">${saveLabel}</button></div>` +
        '</div></div>'
    );
}
