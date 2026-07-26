/**
 * HTML for the agenda header: the mode segment, the view-history and date
 * navigation, the header-layout button, the file-tag dropdown and the hero
 * title.
 *
 * Same reason as agendaSummaryHtml.ts: these used to read the UI dictionary and
 * the live view state straight off the client's scope, which put them out of
 * reach of the unit suite because the page runs in a webview no coverage runner
 * instruments. Taking that state as parameters makes them testable; the client
 * keeps only the DOM writes and the listener wiring.
 *
 * Each function is inlined into the page through `Function.prototype
 * .toString()`, so a body may only touch its own parameters and functions
 * defined in this module (those land in the page's global scope side by side).
 * No value imports -- a cross-module call compiles to `module_1.fn`, which is
 * undefined in the page.
 */
import type { AgendaStrings, ModeStrings } from './agendaI18n';
import type { EscapeHtml, FormatString } from './agendaSummaryHtml';

/** The navigation unit Prev/Next steps by; Tasks view has no date navigation. */
export type NavUnit = 'day' | 'week' | 'month';

/** Header layout the button names and cycles. */
export type HeaderLayoutMode = 'auto' | 'full' | 'compact';

/**
 * The mode segment: one button per view, the active one marked. `data-mode`
 * is what the click handler reads, so it carries the id rather than the label.
 */
export function renderModeSwitch(
    activeMode: string,
    ctx: { modes: ModeStrings; switchToView: string; escapeHtml: EscapeHtml; formatString: FormatString }
): string {
    const ids: (keyof ModeStrings)[] = ['day', 'week', 'month', 'tasks'];
    const buttons = ids
        .map((id) => {
            const label = ctx.modes[id];
            const title = ctx.escapeHtml(ctx.formatString(ctx.switchToView, label));
            const active = id === activeMode ? ' active' : '';
            return `<button class="seg-item${active}" data-mode="${id}" title="${title}">${ctx.escapeHtml(label)}</button>`;
        })
        .join('');
    return `<span class="mode-seg">${buttons}</span>`;
}

/**
 * The implicit "no filter" tag is stored as `ALL` and shown translated;
 * user-defined tag names are shown as configured.
 */
export function tagLabel(name: string, allLabel: string): string {
    return name === 'ALL' ? allLabel : name;
}

/** Text of the collapsed dropdown button, caret included. */
export function tagButtonText(
    tag: string,
    ctx: { tagAll: string; tagButton: string; formatString: FormatString }
): string {
    return `${ctx.formatString(ctx.tagButton, tagLabel(tag, ctx.tagAll))} ▾`;
}

/**
 * The file-tag dropdown: a collapsed button plus a list of tags. The ids and
 * the `data-tag` attribute are hardcoded because the click handlers
 * (`toggleMenu`, `attachTagMenuListeners`) address them directly -- a second
 * dropdown would need its own handlers anyway.
 */
export function renderTagMenu(
    tags: readonly string[],
    currentTag: string,
    ctx: {
        tagAll: string;
        tagAllTitle: string;
        tagButton: string;
        tagCaption: string;
        tagFilterTitle: string;
        escapeHtml: EscapeHtml;
        formatString: FormatString;
    }
): string {
    const rows = tags
        .map((name) => {
            const title = name === 'ALL' ? ctx.tagAllTitle : ctx.formatString(ctx.tagFilterTitle, name);
            const active = name === currentTag ? ' active' : '';
            // A dropdown row behaves like a button, so it is one: that is what
            // gives it Tab focus and Enter/Space activation, matching the mode
            // segment next to it.
            return (
                `<button type="button" class="tag-menu-item${active}" data-tag="${ctx.escapeHtml(name)}" ` +
                `title="${ctx.escapeHtml(title)}">` +
                `<span class="tag-menu-check">✓</span>${ctx.escapeHtml(tagLabel(name, ctx.tagAll))}</button>`
            );
        })
        .join('');
    return (
        '<div class="tag-menu" id="tagMenu">' +
        `<button class="tag-menu-btn" id="tagMenuBtn" title="${ctx.escapeHtml(ctx.tagCaption)}">` +
        `${ctx.escapeHtml(tagButtonText(currentTag, ctx))}</button>` +
        '<div class="tag-menu-list">' +
        `<div class="tag-menu-label">${ctx.escapeHtml(ctx.tagCaption)}</div>` +
        rows +
        '</div></div>'
    );
}

/**
 * The header-layout button: it names the current mode and cycles it
 * (auto -> full -> compact) on click. The setting exists for a panel too short
 * for the full header, which is exactly when reaching for the settings editor
 * is most awkward; the tooltip names what one click gives, so the cycle is
 * legible without trying it.
 */
export function renderHeaderModeButton(
    mode: string | undefined,
    ctx: {
        headerModeButton: string;
        headerModeTitle: string;
        headerModes: AgendaStrings['headerModes'];
        escapeHtml: EscapeHtml;
        formatString: FormatString;
        nextHeaderMode: (value: string | undefined) => HeaderLayoutMode;
    }
): string {
    const current: HeaderLayoutMode = mode === 'full' || mode === 'compact' ? mode : 'auto';
    const next = ctx.nextHeaderMode(current);
    const label = ctx.escapeHtml(ctx.formatString(ctx.headerModeButton, ctx.headerModes[current]));
    const title = ctx.escapeHtml(
        ctx.formatString(ctx.headerModeTitle, ctx.headerModes[current], ctx.headerModes[next])
    );
    return `<button class="chip-btn" id="headerModeBtn" title="${title}" aria-label="${title}">${label}</button>`;
}

/**
 * View history (Back/Forward over `{mode, date}` states). The feature has
 * keyboard shortcuts, but every other navigation in the panel is a visible
 * button, and the commands only appear in the Command Palette while the agenda
 * has focus -- so without these two it is unreachable unless you already know
 * it exists. The tooltips name the chords, which is where the user learns them.
 */
export function renderHistoryNav(ctx: {
    historyBack: string;
    historyForward: string;
    backChord: string;
    forwardChord: string;
    escapeHtml: EscapeHtml;
    formatString: FormatString;
}): string {
    const back = ctx.escapeHtml(ctx.formatString(ctx.historyBack, ctx.backChord));
    const forward = ctx.escapeHtml(ctx.formatString(ctx.historyForward, ctx.forwardChord));
    return (
        '<span class="date-nav history-nav">' +
        `<button class="nav-btn nav-btn-arrow" id="btn-history-back" title="${back}" aria-label="${back}">⟨</button>` +
        `<button class="nav-btn nav-btn-arrow" id="btn-history-forward" title="${forward}" aria-label="${forward}">⟩</button>` +
        '</span>'
    );
}

/**
 * Prev/Today/Next. The wording is per unit, not a "Previous {unit}" template:
 * in some languages the adjective agrees with the noun's gender (ru:
 * "Предыдущий день" / "Предыдущая неделя").
 */
export function renderDateNav(
    unit: NavUnit,
    ctx: {
        navPrev: AgendaStrings['navPrev'];
        navNext: AgendaStrings['navNext'];
        navToday: string;
        navTodayTitle: string;
        escapeHtml: EscapeHtml;
    }
): string {
    const prev = ctx.escapeHtml(ctx.navPrev[unit]);
    const next = ctx.escapeHtml(ctx.navNext[unit]);
    return (
        '<span class="date-nav">' +
        `<button class="nav-btn nav-btn-arrow" id="btn-prev" title="${prev}" aria-label="${prev}">‹</button>` +
        `<button class="nav-btn nav-btn-today" id="btn-today" title="${ctx.escapeHtml(ctx.navTodayTitle)}">` +
        `${ctx.escapeHtml(ctx.navToday)}</button>` +
        `<button class="nav-btn nav-btn-arrow" id="btn-next" title="${next}" aria-label="${next}">›</button>` +
        '</span>'
    );
}

/**
 * The hero title. `sub` is the second line (the date or the year); the Tasks
 * view has none and gets the title alone. `badge` is the TODAY marker, shown
 * only when the anchor is today.
 */
export function renderHeroHtml(
    parts: { title: string; sub?: string; badge?: string },
    ctx: { escapeHtml: EscapeHtml }
): string {
    const title = `<div class="hero-title">${ctx.escapeHtml(parts.title)}</div>`;
    if (parts.sub === undefined) {
        return title;
    }
    const badge = parts.badge ? `<span class="hero-badge">${ctx.escapeHtml(parts.badge)}</span>` : '';
    return `${title}<div class="hero-sub"><span>${ctx.escapeHtml(parts.sub)}</span>${badge}</div>`;
}

/**
 * The two header rows. The mode segment sits on its own row (per the approved
 * Nav "A" mockup) so its underline does not share a baseline with the boxed nav
 * buttons; the compact layout folds the rows onto one through CSS alone, which
 * is why the markup here is the same in both.
 */
export function renderNavBarHtml(parts: {
    modeSwitch: string;
    history: string;
    dateNav: string;
    chips: string;
}): string {
    return (
        `<div class="seg-row">${parts.modeSwitch}</div>` +
        '<div class="control-row">' +
        parts.history +
        parts.dateNav +
        '<span class="nav-spacer"></span>' +
        parts.chips +
        '</div>'
    );
}
