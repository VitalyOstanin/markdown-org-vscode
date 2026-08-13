/**
 * HTML for the day/tasks summary bar and its section panels.
 *
 * These used to live inside the agenda client, where they read the UI
 * dictionary, the locale and the plural helpers straight off the enclosing
 * scope. That scope is what makes the client hard to cover: the page runs in
 * the webview, which no coverage runner instruments. Taking the state as
 * parameters puts the markup under the unit suite instead.
 *
 * Each function is inlined into the page through `Function.prototype
 * .toString()`, so a body may only touch its own parameters -- no imports, no
 * module-level names.
 */

/** Escapes text for HTML; the page passes its own copy of `escapeHtml`. */
export type EscapeHtml = (text: string | number | boolean | undefined | null) => string;

/** Fills `{0}`-style placeholders; the page passes its own `formatString`. */
export type FormatString = (template: string, ...values: string[]) => string;

/** Picks the plural form index for `n` in `language`. */
export type PluralIndex = (n: number, language: string) => number;

/** Renders `n` in the date locale's digits. */
export type FormatNumber = (n: number, locale: string) => string;

/** The localized parts of a day header, as `formatDayHeaderParts` returns them. */
export interface DayHeaderPartsLike {
    weekday: string;
    day: string;
    month: string;
    year: string;
}

/**
 * A counted noun: "3 tasks" / "3 задачи". The digits follow the date locale,
 * the plural form follows the UI language -- the same split the rest of the
 * panel uses.
 */
export function countLabel(
    n: number,
    forms: string[],
    ctx: { locale: string; uiLang: string; formatNumber: FormatNumber; pluralIndex: PluralIndex }
): string {
    return `${ctx.formatNumber(n, ctx.locale)} ${forms[ctx.pluralIndex(n, ctx.uiLang)] ?? ''}`;
}

/**
 * One `<b>N</b> word` stat for the summary bar. `word` is either a plain
 * qualifier ("overdue") or the plural forms of a counted noun.
 */
export function summaryStat(
    n: number,
    word: string | string[],
    cls: string,
    ctx: {
        locale: string;
        uiLang: string;
        escapeHtml: EscapeHtml;
        formatNumber: FormatNumber;
        pluralIndex: PluralIndex;
    }
): string {
    const label = Array.isArray(word) ? word[ctx.pluralIndex(n, ctx.uiLang)] : word;
    const count = ctx.formatNumber(n, ctx.locale);
    return `<span class="day-summary-stat${cls ? ` ${cls}` : ''}"><b>${count}</b> ${ctx.escapeHtml(label)}</span>`;
}

/**
 * The summary bar, which reuses the sticky `.day-header` shell. `dateIso` is
 * the view's anchor date in the day view and empty in the date-less tasks
 * view, which then emits no `data-date` (the rendered-info query only collects
 * headers that carry one).
 */
export function renderSummaryBar(dateIso: string, pieces: string[], ctx: { escapeHtml: EscapeHtml }): string {
    const dateAttr = dateIso ? ` data-date="${ctx.escapeHtml(dateIso)}"` : '';
    return `<div class="day-header day-summary"${dateAttr}>${pieces.join('<span class="day-summary-sep">·</span>')}</div>`;
}

/** Whether a section is folded away, and what pressing its head would do. */
export interface SectionFold {
    /** True while the section's rows are left out of the render. */
    folded: boolean;
    /** Tooltip and accessible name of the control, already in the UI language. */
    label: string;
}

/**
 * The control that folds a section, at the head's leading edge.
 *
 * A glyph rather than an icon, for the reason the Android client uses one: the
 * head is text already, and a vector here would be the only drawing on a page
 * that has none. It is still a `<button>` -- the fold is reachable by keyboard
 * and announced as expanded or collapsed, which a bare span could not do -- and
 * the whole head answers a press, so the target is the heading, not the glyph.
 */
export function sectionFoldHtml(fold: SectionFold, escapeHtml: EscapeHtml): string {
    const label = escapeHtml(fold.label);
    return (
        `<button type="button" class="day-section-fold" aria-expanded="${fold.folded ? 'false' : 'true'}"` +
        ` title="${label}" aria-label="${label}">${fold.folded ? '▸' : '▾'}</button>`
    );
}

/**
 * One section panel: the fold control, title, count chip, whatever the head
 * offers on the whole section (`actionsHtml`, empty for a section that offers
 * nothing) and the already-rendered rows.
 *
 * A folded section is a head with no body at all -- the caller passes no rows,
 * and nothing here draws an empty container for them. The count stays on the
 * head either way: a folded section still has to say how much is behind it, or
 * folding it hides the fact that it is there.
 */
export function renderSectionPanel(
    key: string,
    title: string,
    count: number,
    rowsHtml: string,
    ctx: {
        locale: string;
        uiLang: string;
        inSectionTemplate: string;
        taskForms: string[];
        fold: SectionFold;
        escapeHtml: EscapeHtml;
        formatString: FormatString;
        formatNumber: FormatNumber;
        pluralIndex: PluralIndex;
    },
    actionsHtml: string
): string {
    // The count chip is the same component as the month cell's task-load chip,
    // so it explains its number the same way.
    const chipTitle = ctx.escapeHtml(ctx.formatString(ctx.inSectionTemplate, countLabel(count, ctx.taskForms, ctx)));
    // The chip and its tooltip say the same number, so they count it the same
    // way -- the tooltip already went through `formatNumber`.
    const chipCount = ctx.escapeHtml(ctx.formatNumber(count, ctx.locale));
    // The marker goes on both elements: the panel needs it for the room it
    // takes with no body under it, and the head carries it because the head is
    // what the state is about -- in the week view there is no panel at all, and
    // both views must be readable the same way.
    const foldedCls = ctx.fold.folded ? ' day-section-is-folded' : '';
    return (
        `<section class="day-section day-section-${key}${foldedCls}">` +
        `<div class="day-section-head${foldedCls}" data-section="${ctx.escapeHtml(key)}">` +
        sectionFoldHtml(ctx.fold, ctx.escapeHtml) +
        `<span class="day-section-name">${ctx.escapeHtml(title)}</span>` +
        `<span class="day-section-count" title="${chipTitle}">${chipCount}</span>` +
        actionsHtml +
        '</div>' +
        (ctx.fold.folded ? '' : `<div class="day-section-body">${rowsHtml}</div>`) +
        '</section>'
    );
}

/**
 * One band heading for the week view: the section's name and its count, with no
 * panel around it.
 *
 * The week renders as a flat sequence -- a day header, then that day's rows as
 * its siblings -- and the clipping chips count those rows by walking the
 * siblings (see agendaClipMarkers). A `<section>` wrapper would take the rows
 * out of that walk and leave the chips reporting less than the day holds, so
 * the band announces itself with a heading and leaves the rows where they are.
 *
 * The classes are the panel's own, so a band reads the same in both views: the
 * head's layout, and the red name and chip that `day-section-overdue-*` tints.
 * The fold control is the panel's too -- the band folds by leaving its rows out
 * of the render, which is what the sibling walk needs: rows merely hidden would
 * still be counted, and a day whose backlog is folded would report every folded
 * row as one scrolled out of sight.
 */
export function renderBandHeading(
    key: string,
    title: string,
    count: number,
    ctx: {
        locale: string;
        uiLang: string;
        inSectionTemplate: string;
        taskForms: string[];
        fold: SectionFold;
        escapeHtml: EscapeHtml;
        formatString: FormatString;
        formatNumber: FormatNumber;
        pluralIndex: PluralIndex;
    }
): string {
    const chipTitle = ctx.escapeHtml(ctx.formatString(ctx.inSectionTemplate, countLabel(count, ctx.taskForms, ctx)));
    const chipCount = ctx.escapeHtml(ctx.formatNumber(count, ctx.locale));
    const foldedCls = ctx.fold.folded ? ' day-section-is-folded' : '';
    return (
        `<div class="day-band day-section-${key} day-section-head${foldedCls}" data-section="${ctx.escapeHtml(key)}">` +
        sectionFoldHtml(ctx.fold, ctx.escapeHtml) +
        `<span class="day-section-name">${ctx.escapeHtml(title)}</span>` +
        `<span class="day-section-count" title="${chipTitle}">${chipCount}</span>` +
        '</div>'
    );
}

/** The three-part day header: weekday, day number, month and year. */
export function renderDayHeaderHtml(parts: DayHeaderPartsLike): string {
    return (
        `<span class="day-weekday">${parts.weekday}</span>` +
        `<span class="day-num">${parts.day}</span>` +
        `<span class="day-rest">${parts.month} ${parts.year}</span>`
    );
}
