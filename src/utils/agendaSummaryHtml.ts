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
    ctx: { uiLang: string; escapeHtml: EscapeHtml; pluralIndex: PluralIndex }
): string {
    const label = Array.isArray(word) ? word[ctx.pluralIndex(n, ctx.uiLang)] : word;
    return `<span class="day-summary-stat${cls ? ` ${cls}` : ''}"><b>${n}</b> ${ctx.escapeHtml(label)}</span>`;
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

/** One section panel: title, count chip and the already-rendered rows. */
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
        escapeHtml: EscapeHtml;
        formatString: FormatString;
        formatNumber: FormatNumber;
        pluralIndex: PluralIndex;
    }
): string {
    // The count chip is the same component as the month cell's task-load chip,
    // so it explains its number the same way.
    const chipTitle = ctx.escapeHtml(ctx.formatString(ctx.inSectionTemplate, countLabel(count, ctx.taskForms, ctx)));
    return (
        `<section class="day-section day-section-${key}">` +
        '<div class="day-section-head">' +
        `<span class="day-section-name">${ctx.escapeHtml(title)}</span>` +
        `<span class="day-section-count" title="${chipTitle}">${count}</span>` +
        '</div>' +
        `<div class="day-section-body">${rowsHtml}</div>` +
        '</section>'
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
