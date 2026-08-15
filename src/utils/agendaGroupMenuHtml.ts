/**
 * The menu a whole overdue band offers, behind the mark at the end of its
 * heading.
 *
 * A menu rather than a row of buttons: the day card shows up to four overdue
 * bands, and three controls under each of them would take four lines from the
 * thing being scrolled. The heading itself stays what it was.
 *
 * Inlined into the webview through `Function.prototype.toString()`, so the body
 * may only touch its own parameters -- no imports, no module-level names.
 */
import type { EscapeHtml, FormatString } from './agendaSummaryHtml';

/** What the menu is called, and what each of its items says. */
export interface GroupMenuStrings {
    menuTitle: string;
    moveToToday: string;
    dropPlanning: string;
    cancel: string;
    moveToTodayHint: string;
    dropPlanningHint: string;
    cancelHint: string;
}

/**
 * The mark plus its collapsed list, for the band named by `sectionKey`.
 *
 * `data-section` and `data-action` are what the page's delegated click handler
 * reads; the extension side turns them back into the band's tasks, so the page
 * never carries the file list of a move.
 *
 * `dateIso` names the day the band belongs to, and only the week view passes it:
 * there the same band key stands under seven day headers, and without the date
 * the host would rebuild the band from the first day of the payload -- the wrong
 * rows, silently. The day view leaves it out, and the host falls back to the one
 * day it rendered.
 */
export function renderGroupMenu(
    sectionKey: string,
    sectionTitle: string,
    ctx: { strings: GroupMenuStrings; escapeHtml: EscapeHtml; formatString: FormatString },
    dateIso?: string
): string {
    const s = ctx.strings;
    const items: { action: string; label: string; hint: string }[] = [
        { action: 'move-to-today', label: s.moveToToday, hint: s.moveToTodayHint },
        { action: 'drop-planning', label: s.dropPlanning, hint: s.dropPlanningHint },
        { action: 'cancel', label: s.cancel, hint: s.cancelHint }
    ];
    const rows = items
        .map(
            (item) =>
                `<button type="button" class="group-menu-item" data-action="${ctx.escapeHtml(item.action)}" ` +
                `title="${ctx.escapeHtml(item.hint)}">${ctx.escapeHtml(item.label)}</button>`
        )
        .join('');
    // The mark is one glyph and says nothing about what is behind it, least of
    // all that what is behind it writes to every note of the band -- which is
    // what the tooltip is for.
    const dateAttr = dateIso === undefined ? '' : ` data-date="${ctx.escapeHtml(dateIso)}"`;
    return (
        `<div class="group-menu" data-section="${ctx.escapeHtml(sectionKey)}"${dateAttr}>` +
        `<button type="button" class="group-menu-btn" title="${ctx.escapeHtml(
            ctx.formatString(s.menuTitle, sectionTitle)
        )}">⋮</button>` +
        `<div class="group-menu-list">${rows}</div>` +
        '</div>'
    );
}
