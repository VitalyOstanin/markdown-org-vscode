/**
 * The agenda webview client: everything that runs inside the panel's page.
 *
 * This is a browser module, not extension-host code. It is compiled by its own
 * project (tsconfig.webview.json, `lib: dom`) and then injected into the page as
 * source text: `AgendaPanel.getHtmlContent` emits `agendaClientMain.toString()`
 * inside the nonce'd `<script>` block and calls it. That is why the function
 * takes everything it needs as parameters -- `Function.prototype.toString()`
 * carries no module bindings, so a runtime `import` here would be a
 * `ReferenceError` in the page. Type-only imports are fine: they are erased
 * before the body is stringified.
 *
 * The pure helpers the client calls (escaping, click resolution, day/tasks card
 * models, tooltips, ...) live in `src/utils/` and are unit-tested there. The host
 * inlines their sources next to this one and hands them over as `deps`, whose
 * shape is declared below; `agendaPanel.ts` type-checks the real functions
 * against that declaration, so a signature change breaks the build rather than
 * the page.
 */

import type { AgendaData, DayAgenda, Task, TaskWithOffset } from '../types';
import type { AgendaStrings } from '../utils/agendaI18n';

/** Injected by the VS Code webview host; the page's only channel to the extension. */
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

// ---------------------------------------------------------------------------
// Contracts for the inlined helpers.
//
// Structural mirrors of the types in `src/utils/`, restated here because those
// modules belong to the host project and this one may not import them. They are
// not a second source of truth: `agendaPanel.ts` assigns the real functions to
// `AgendaClientDeps`, so any drift between a helper and its declaration here is
// a compile error.
// ---------------------------------------------------------------------------

/** What `window.getSelection()` returns, reduced to what the click guard reads. */
export interface SelectionLike {
    readonly isCollapsed: boolean;
    toString(): string;
}

/** DOM element subset the click resolver walks. */
export interface ClickTargetLike {
    closest(selector: string): ClickTargetLike | null;
    getAttribute(name: string): string | null;
}

/** Minimal `MouseEvent` subset the click resolver reads. */
export interface ClickEventLike {
    readonly target: ClickTargetLike | null;
}

/** Task reference posted back to the extension host on click. */
export interface TaskRef {
    readonly file: string;
    readonly line: number;
}

/** Anchor date (`YYYY-MM-DD`) -> remembered `scrollY`. */
export type ScrollMemory = { [anchor: string]: number };

/** Task fields the heading tint rule reads. */
export interface HeadingTintInput {
    readonly priority?: string | null;
    readonly timestamp_type?: string | null;
}

/** Localized pieces of a day header. */
export interface DayHeaderParts {
    weekday: string;
    day: string;
    month: string;
    year: string;
}

/** Type glyph shown in the `.flag` column. */
export type TaskFlag = 'cancelled' | 'deadline' | 'repeat' | 'scheduled' | '';

/** How much attention a row's status dot asks for. */
export type AttentionLevel = 'done' | 'cancelled' | 'danger' | 'normal';

/** Tooltip dictionary section (see `AgendaStrings.tooltips`). */
export type TooltipStrings = AgendaStrings['tooltips'];

/** Timestamp fields the detailed flag tooltip reads. */
export interface FlagTooltipTask {
    timestamp_date?: string;
    timestamp_time?: string;
    timestamp_end_time?: string;
    timestamp_repeater?: string;
    timestamp_next?: string;
}

/** Nav-bar title model. */
export interface HeroModel {
    kind: 'date' | 'month' | 'tasks';
    showToday: boolean;
}

/** Day-card headline counts. */
export interface DaySummary {
    total: number;
    overdue: number;
    done: number;
}

/** Which bucket a day-card row came from. */
export type DaySectionItemKind = 'overdue' | 'timed' | 'notime' | 'upcoming';

export interface DaySectionItem {
    task: TaskWithOffset;
    kind: DaySectionItemKind;
}

export interface DaySection {
    key: 'scheduled' | 'allday' | 'overdue';
    title: string;
    items: DaySectionItem[];
}

/** Day-card panel titles (see `AgendaStrings.sections`). */
export interface DaySectionLabels {
    scheduled: string;
    allday: string;
    overdue: string;
}

/** Tasks-card headline counts. */
export interface TasksSummary {
    total: number;
    highPriority: number;
    done: number;
}

export interface TaskGroup {
    key: 'a' | 'b' | 'c' | 'none';
    title: string;
    items: Task[];
}

/** Tasks-card group titles (see `AgendaStrings.groups`). */
export interface TaskGroupLabels {
    a: string;
    b: string;
    c: string;
    none: string;
}

/** Per-date counts behind the month calendar's cell chips. */
export interface MonthCellCounts {
    total: number;
    overdue: number;
}

export type MonthDayIndex = Record<string, MonthCellCounts>;

/** Day-header element subset the week-view drill-down wiring touches. */
export interface DayHeaderElementLike {
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    classList: { add(token: string): void };
    addEventListener(type: 'click', listener: () => void): void;
}

/** Root that can query for day-header elements (a Document or a container). */
export interface DayHeaderRootLike {
    querySelectorAll(selectors: string): ArrayLike<DayHeaderElementLike>;
}

/**
 * The pure helpers the client runs on. Each one is inlined into the page as a
 * top-level function declaration and handed over here by name, so a helper that
 * calls another helper still resolves it through the page's global scope.
 *
 * Declared as function-typed properties rather than methods: these are free
 * functions that never see a `this`, and the property form says so -- both to a
 * reader and to `@typescript-eslint/unbound-method`, which otherwise treats
 * destructuring them out of `deps` as unbinding a method.
 */
export interface AgendaClientDeps {
    /** Called by `resolveTaskClickIntent`; not invoked directly by the client. */
    isMeaningfulSelection: (sel: SelectionLike | null) => boolean;
    resolveTaskClickIntent: (event: ClickEventLike, selection: SelectionLike | null) => TaskRef | null;
    sanitizeTaskLine: (value: unknown) => number;
    escapeHtml: (text: string | undefined | null) => string;
    rememberScroll: (history: ScrollMemory, anchor: string, scrollY: number) => void;
    recallScroll: (history: ScrollMemory, anchor: string) => number | null;
    resolveHeadingClass: (task: HeadingTintInput) => string;
    toIsoDate: (date: Date) => string;
    formatDayHeaderParts: (dateStr: string, locale: string) => DayHeaderParts;
    isCancelled: (status: string | undefined) => boolean;
    resolveTaskFlag: (task: Task, isCancelled: (status: string | undefined) => boolean) => TaskFlag;
    resolveAttentionLevel: (
        task: Task,
        daysOffset: number | undefined,
        taskType: string | undefined,
        isCancelled: (status: string | undefined) => boolean
    ) => AttentionLevel;
    shiftMonthAnchor: (date: Date, offset: number) => Date;
    wireDayHeaderNavigation: (
        root: DayHeaderRootLike,
        mode: string,
        onNavigate: (date: string) => void,
        title: string
    ) => number;
    /**
     * Both tooltip helpers take the `{0}` substitution as an argument (see
     * `formatString`); the flag tooltip also takes date rendering, so its dates
     * follow the locale exactly like the offset column's.
     */
    flagTooltip: (
        flag: string,
        strings: TooltipStrings,
        fill: (template: string, ...values: string[]) => string,
        fmtDate: (iso: string) => string,
        task?: FlagTooltipTask
    ) => string;
    formatIsoDate: (iso: string, locale: string) => string;
    attentionTooltip: (level: string, strings: TooltipStrings) => string;
    priorityTooltip: (
        letter: string,
        strings: TooltipStrings,
        fill: (template: string, ...values: string[]) => string
    ) => string;
    resolveHeroModel: (mode: string, shiftedToday: string, todayIso: string) => HeroModel;
    computeDaySummary: (day: DayAgenda) => DaySummary;
    buildDaySections: (day: DayAgenda, labels: DaySectionLabels) => DaySection[];
    computeTasksSummary: (tasks: Task[]) => TasksSummary;
    buildTaskGroups: (tasks: Task[], labels: TaskGroupLabels) => TaskGroup[];
    buildMonthDayIndex: (days: DayAgenda[]) => MonthDayIndex;
    formatString: (template: string, ...values: string[]) => string;
    pluralIndex: (n: number, lang: string) => number;
    /** Cycle behind the header-layout button: auto -> full -> compact. */
    nextHeaderMode: (value: string | undefined) => 'auto' | 'full' | 'compact';
    resolveHeaderLayout: (
        mode: string | undefined,
        viewportHeight: number,
        context?: {
            headerHeight?: number;
            current?: 'full' | 'compact';
            threshold?: number;
            enterRatio?: number;
            exitRatio?: number;
        }
    ) => 'full' | 'compact';
    formatNumber: (value: number, locale: string) => string;
}

/**
 * Dictionary the client starts with. The panel always follows up with the same
 * strings in its `init` message, but a render must never depend on an undefined
 * `UI` object if it happens first.
 */
export interface AgendaClientBootstrap {
    strings: AgendaStrings;
    language: string;
}

/** Messages the extension host sends into the page. */
/** Fields `init` and `update` share: the state the page renders from. */
interface AgendaStatePayload {
    data?: AgendaData;
    mode?: string;
    locale?: string;
    shiftedToday?: string;
    currentTag?: string;
    availableTags?: string[];
    firstDayOfWeek?: string;
    headerMode?: string;
    strings?: AgendaStrings;
    language?: string;
}

/**
 * What the host can send. One discriminant (`command`) in both directions --
 * the page answers with `command` too -- so a `switch` narrows the payload and
 * a new message cannot pick its own key.
 */
type HostMessage =
    | ({ command: 'init'; holidays?: string[] } & AgendaStatePayload)
    | ({ command: 'update'; userInitiated?: boolean; navigation?: boolean } & AgendaStatePayload)
    | { command: 'headerMode'; headerMode?: string }
    | { command: 'getRenderedInfo' };

/** `Intl.Locale.weekInfo` is not in the ES2022 lib yet, but browsers ship it. */
interface LocaleWithWeekInfo {
    weekInfo?: { firstDay?: number };
}

/**
 * Run the agenda client in the page. Called once, from the injected `<script>`.
 */
export function agendaClientMain(boot: AgendaClientBootstrap, deps: AgendaClientDeps): void {
    // Bound to locals so the body reads like the helper sources it is inlined
    // next to. The helpers themselves live in the page's global scope, which is
    // how the ones that call each other keep working.
    const {
        resolveTaskClickIntent,
        sanitizeTaskLine,
        escapeHtml,
        rememberScroll,
        recallScroll,
        resolveHeadingClass,
        toIsoDate,
        formatDayHeaderParts,
        isCancelled,
        resolveTaskFlag,
        resolveAttentionLevel,
        shiftMonthAnchor,
        wireDayHeaderNavigation,
        flagTooltip,
        attentionTooltip,
        priorityTooltip,
        resolveHeroModel,
        computeDaySummary,
        buildDaySections,
        computeTasksSummary,
        buildTaskGroups,
        buildMonthDayIndex,
        formatString,
        pluralIndex,
        formatIsoDate,
        nextHeaderMode,
        resolveHeaderLayout,
        formatNumber
    } = deps;

    /** Columns in the month calendar grid -- a week. */
    const CALENDAR_COLS = 7;

    // Active UI dictionary and language. Replaced by every init/update message,
    // so changing markdown-org.uiLanguage re-renders in the new language on the
    // next Show Agenda.
    let UI: AgendaStrings = boot.strings;
    let uiLang: string = boot.language;

    // "3 tasks" / "3 задачи": picks the plural form for n and fills it in.
    function countLabel(n: number, forms: string[]): string {
        // The plural form follows the UI language; the digits follow the date
        // locale, like every other number on the panel.
        return formatNumber(n, locale) + ' ' + forms[pluralIndex(n, uiLang)];
    }

    const vscode = acquireVsCodeApi();
    // Handshake for the ServiceWorker-race retry path on the extension side:
    // tells AgendaPanel.armReadyTimeout the webview script is alive so the
    // timeout-triggered dispose+recreate does not fire.
    vscode.postMessage({ command: 'ready' });

    let initialData: AgendaData = [];
    let initialMode = '';
    let locale = '';
    // The anchor date the panel is built around: today plus any Prev/Next
    // offset. Equals today on first open and after the Today button; can move
    // forward/backward via navigation. Drives the navbar label, Prev/Next
    // stepping, and the month-calendar target.
    let shiftedToday = '';
    let currentTag = '';
    // Tag rotation the dropdown lists (implicit ALL + configured fileTags),
    // supplied by the host on init/update so a settings change re-populates the
    // menu without reopening the panel.
    let availableTags: string[] = ['ALL'];
    let holidays: string[] = [];
    let firstDayOfWeek = 'monday';
    // Per-anchor scroll memory. Saved on every navigate() before the postMessage
    // and restored on navigation=true updates so that a round-trip (Next then
    // Prev, or Prev then Next) returns the user to where they were instead of
    // snapping back to today's header.
    const scrollHistory: ScrollMemory = {};

    // Header layout: 'auto' | 'full' | 'compact' (markdown-org.agendaHeaderMode).
    // Only the resolved outcome reaches the DOM, as a class on <body>.
    let headerMode = 'auto';

    // Last height the header was measured at while the full layout was on
    // screen. That is the height `auto` decides against -- the cost the compact
    // layout exists to avoid -- and it cannot be read off a compact header, so
    // it is remembered from the renders that did show the full one. 0 until the
    // first of them, where the decision falls back to the panel height.
    let fullHeaderHeight = 0;

    /**
     * Apply the header layout for the current mode and viewport. Called after
     * every render and on resize, because `auto` follows the share of the panel
     * the header takes and a webview panel is resized by dragging the editor
     * split. Must run after the header is in the DOM: an unmeasured header
     * leaves the decision to the panel-height fallback.
     */
    function applyHeaderLayout(): void {
        const header = document.getElementById('agenda-header');
        const current = document.body.classList.contains('compact-header') ? 'compact' : 'full';
        if (current === 'full' && header && header.offsetHeight > 0) {
            fullHeaderHeight = header.offsetHeight;
        }
        const compact =
            resolveHeaderLayout(headerMode, window.innerHeight, {
                headerHeight: fullHeaderHeight,
                current: current
            }) === 'compact';
        document.body.classList.toggle('compact-header', compact);
    }

    // Publish the sticky nav-bar's live height as --agenda-header-h so the
    // sticky day-headers pin directly below it (their top / scroll-margin-top
    // read this var). Re-measured after every render and on resize because the
    // header wraps differently by width, mode and font.
    function syncHeaderOffset(): void {
        const header = document.getElementById('agenda-header');
        const h = header ? header.offsetHeight : 0;
        document.documentElement.style.setProperty('--agenda-header-h', h + 'px');
    }

    // Keep --agenda-header-h locked to the header's ACTUAL height through every
    // change: viewport width (nav-bar wrapping), mode/content re-renders, and
    // late web-font swaps that resize the buttons after the first measurement. A
    // stale, too-large value leaves an uncovered band below the shrunken header
    // where scrolling tasks bleed through under the pinned day-headers. A
    // ResizeObserver on the header catches every box-size change (a plain window
    // 'resize' listener misses font swaps and re-renders); fonts.ready covers
    // the initial swap directly.
    const agendaHeaderEl = document.getElementById('agenda-header');
    if (agendaHeaderEl && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncHeaderOffset).observe(agendaHeaderEl);
    } else {
        window.addEventListener('resize', syncHeaderOffset);
    }
    if (document.fonts) {
        // The offset is re-measured on every later resize anyway, so a failed
        // font load costs nothing here. It still gets its own catch: without
        // one it would reach the global unhandledrejection listener, which
        // reports to the host -- a font that did not load is not a page
        // failure worth a line in the log.
        void document.fonts.ready.then(syncHeaderOffset).catch(function () {
            /* nothing to do: the next resize re-measures */
        });
    }
    // The layout itself follows the panel height, which only a resize changes.
    // The header's own ResizeObserver then re-measures --agenda-header-h,
    // because switching layouts changes the header's height.
    window.addEventListener('resize', applyHeaderLayout);

    /**
     * Tell the host the page failed, so the user gets a message instead of an
     * empty panel. Nothing else in the page can report: an exception here only
     * reaches the webview devtools console, which nobody has open.
     */
    function report(command: string, context: string, reason: unknown): void {
        const detail = reason instanceof Error ? reason.message : String(reason);
        vscode.postMessage({ command: command, message: context + ': ' + detail });
    }

    /** A render the page could not finish: the host toasts the first one per panel. */
    function reportRenderError(context: string, reason: unknown): void {
        report('renderError', context, reason);
    }

    // Anything that escapes a listener (including a rejected promise) still
    // reaches the host through these two, which is what makes a failure visible
    // rather than silent. They report as `pageWarning`, not `renderError`: what
    // lands here is anything at all -- a background promise, an image, a
    // listener unrelated to rendering -- and one of those must not consume the
    // single "agenda failed to render" toast that a real render failure gets.
    window.addEventListener('error', (event) => {
        report('pageWarning', 'agenda script error', event.message || event.error);
    });
    window.addEventListener('unhandledrejection', (event) => {
        report('pageWarning', 'agenda promise rejection', event.reason);
    });

    window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
        const message = event.data;
        try {
            handleHostMessage(message);
        } catch (err) {
            // A render that throws leaves #content half-built at best; the host
            // turns this into a visible error instead of a blank agenda.
            reportRenderError('agenda render failed', err);
        }
    });

    function handleHostMessage(message: HostMessage): void {
        if (message.command === 'init') {
            initialData = message.data ?? [];
            initialMode = message.mode ?? '';
            locale = message.locale ?? '';
            shiftedToday = message.shiftedToday ?? '';
            currentTag = message.currentTag ?? '';
            if (message.availableTags) {
                availableTags = message.availableTags;
            }
            holidays = message.holidays ?? [];
            if (message.firstDayOfWeek) {
                firstDayOfWeek = message.firstDayOfWeek;
            }
            if (message.headerMode) {
                headerMode = message.headerMode;
            }
            if (message.strings) {
                UI = message.strings;
                uiLang = message.language || uiLang;
            }
            // After renderNavBar, not before: the layout is decided from the
            // header's measured height, and before the first render there is
            // nothing to measure.
            renderNavBar();
            applyHeaderLayout();
            syncHeaderOffset();
            renderCurrentMode();
            scrollToWeekFocus();
        } else if (message.command === 'update') {
            if (message.locale) {
                // Dates follow the setting on the next render, like the
                // dictionary above -- otherwise a locale change repainted the
                // labels but left the dates formatted the old way.
                locale = message.locale;
            }
            if (message.shiftedToday) {
                shiftedToday = message.shiftedToday;
            }
            if (message.currentTag) {
                currentTag = message.currentTag;
            }
            if (message.availableTags) {
                availableTags = message.availableTags;
            }
            if (message.mode) {
                initialMode = message.mode;
            }
            if (message.firstDayOfWeek) {
                firstDayOfWeek = message.firstDayOfWeek;
            }
            if (message.headerMode) {
                headerMode = message.headerMode;
            }
            if (message.strings) {
                UI = message.strings;
                uiLang = message.language || uiLang;
            }
            initialData = message.data ?? [];
            const userInitiated = message.userInitiated === true;
            const navigation = message.navigation === true;
            const scrollPos = window.scrollY;
            const wasOnCurrentWeek = currentWeekIsVisible();
            renderNavBar();
            // Every mode carries its own header (a week names one day, a month
            // one month), so the share it takes is re-decided per render, not
            // only when the setting changes.
            applyHeaderLayout();
            syncHeaderOffset();
            renderCurrentMode();
            if (!userInitiated) {
                // File-watcher / cycleTag refresh -- keep scroll.
                window.scrollTo(0, scrollPos);
            } else if (initialMode !== 'week') {
                // Day / month / tasks have no per-day scroll anchor.
            } else if (navigation) {
                // Prev/Next/Today. If we've been on this anchor before
                // (round-trip case), restore the user's last scroll there;
                // otherwise focus the week as usual.
                const remembered = recallScroll(scrollHistory, shiftedToday);
                if (remembered !== null) {
                    window.scrollTo(0, remembered);
                } else {
                    scrollToWeekFocus();
                }
            } else if (wasOnCurrentWeek && currentWeekIsVisible()) {
                // Repeated Show Agenda (Week) on the same current week -- keep
                // the user's place.
                window.scrollTo(0, scrollPos);
            } else {
                scrollToWeekFocus();
            }
        } else if (message.command === 'headerMode') {
            // The setting changed while the panel was open -- from the settings
            // editor, the command, or the button in the control row. Only the
            // <body> class and that button's label depend on it, so this
            // reflows the header in place instead of re-rendering the agenda:
            // no scroll jump, no data round-trip.
            headerMode = message.headerMode ?? 'auto';
            applyHeaderLayout();
            refreshHeaderModeButton();
        } else if (message.command === 'getRenderedInfo') {
            // Integration-test query: snapshot the rendered DOM so the host can
            // verify that renderAgenda produced the expected day-headers for the
            // given anchor date. Production code never sends this query, so it
            // has no effect on normal use.
            const headers = Array.from(document.querySelectorAll('.day-header'))
                .map((el) => el.getAttribute('data-date'))
                .filter((d) => d !== null);
            const flags = Array.from(document.querySelectorAll('.flag')).map((el) => el.getAttribute('data-flag'));
            // Section-panel titles in document order (Day and Tasks cards), so a
            // test can assert the grouping and its order.
            const sections = Array.from(document.querySelectorAll('.day-section-name')).map((el) => el.textContent);
            // Measured, not inferred: the compact header is only compact if the
            // hero really shares a line with the control block. A class on
            // <body> proves nothing about the layout it was supposed to
            // produce, so the two boxes are compared for vertical overlap.
            const heroEl = document.querySelector('.agenda-hero');
            const navEl = document.getElementById('nav-bar');
            let heroSharesControlRow = false;
            if (heroEl && navEl) {
                const hero = heroEl.getBoundingClientRect();
                const nav = navEl.getBoundingClientRect();
                heroSharesControlRow = hero.bottom > nav.top + 1 && nav.bottom > hero.top + 1;
            }
            // Hero subtitle and calendar cell numbers as rendered: a locale with
            // non-Latin digits must reach the page as such, and nothing but the
            // rendered text proves it.
            const heroSub = document.querySelector('.hero-sub span')?.textContent ?? '';
            const dayNumbers = Array.from(document.querySelectorAll('.calendar-day .day-number')).map(
                (el) => el.textContent ?? ''
            );
            vscode.postMessage({
                command: 'renderedInfo',
                dayHeaders: headers,
                heroSub,
                dayNumbers,
                mode: initialMode,
                flags,
                sections,
                // The header layout is a class on <body>, so this is how a test
                // sees which of the two the page settled on.
                headerLayout: document.body.classList.contains('compact-header') ? 'compact' : 'full',
                heroSharesControlRow
            });
        }
    }

    // Render the current mode into #content and wire its listeners. Shared by
    // the init and update paths so the two can never drift apart.
    function renderCurrentMode(): void {
        const content = document.getElementById('content');
        if (!content) {
            return;
        }
        if (initialMode === 'month') {
            content.innerHTML = renderMonthCalendar(initialData as DayAgenda[]);
            attachCalendarListeners();
            return;
        }
        if (initialMode === 'week') {
            content.innerHTML = renderAgenda(initialData as DayAgenda[]);
            wireDayHeaderNavigation(document, initialMode, navigateToDay, UI.openDayView);
            return;
        }
        // An unknown mode renders nothing rather than guessing a view.
        if (initialMode !== 'day' && initialMode !== 'tasks') {
            return;
        }
        content.innerHTML =
            initialMode === 'day' ? renderDayCard(initialData as DayAgenda[]) : renderTasks(initialData as Task[]);
    }

    function parseLocalDate(str: string): Date {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function isHoliday(date: string): boolean {
        return holidays.includes(date);
    }

    function navigateToDay(date: string): void {
        vscode.postMessage({ command: 'navigate', date: date, switchToDay: true });
    }

    // Toggle a nav-bar dropdown and collapse any other open one. #tagMenu is the
    // only one there is: the id is a parameter because the collapse pass has to
    // tell it from the rest, not because a second dropdown would work out of the
    // box -- that one would bring its own markup and listeners (see
    // renderTagMenu / attachTagMenuListeners, both hardcoded to #tagMenu).
    function toggleMenu(ev: Event, id: string): void {
        ev.stopPropagation();
        document.querySelectorAll('.tag-menu').forEach(function (m) {
            if (m.id === id) {
                m.classList.toggle('open');
            } else {
                m.classList.remove('open');
            }
        });
    }
    document.addEventListener('click', function () {
        document.querySelectorAll('.tag-menu.open').forEach(function (m) {
            m.classList.remove('open');
        });
    });

    // Agenda navigation history (Alt+Shift+- back, Alt+Shift+= forward) is NOT
    // handled here. The page used to capture those chords on window and call
    // stopImmediatePropagation, which meant the shortcut could not be seen in
    // Keyboard Shortcuts, could not be rebound or disabled, and swallowed
    // whatever else the user had bound to them while the agenda had focus.
    // They are contributed keybindings now (package.json, gated on
    // markdown-org.agendaFocused) for markdown-org.agendaBack /
    // markdown-org.agendaForward; VS Code forwards the chord from the webview
    // to the workbench, which dispatches the command.

    function attachCalendarListeners(): void {
        document.querySelectorAll('.calendar-day').forEach((el) => {
            const date = el.getAttribute('data-date');
            if (date) {
                el.addEventListener('click', () => navigateToDay(date));
            }
        });
    }

    // Task clicks are delegated from #content, wired ONCE here rather than per
    // render. The element comes from the HTML shell and only ever has its
    // innerHTML replaced, so it outlives every render: re-subscribing on each
    // one stacked a fresh closure, and after N refreshes (one per save of a
    // watched .md file) a single click posted N openTask messages and opened
    // the editor N times. Rows themselves are recreated by the render, so
    // delegation is also what keeps the handler valid for the new markup.
    document.getElementById('content')?.addEventListener('click', (e) => {
        // Source of truth: src/utils/agendaClick.ts -- jsdom tested.
        const intent = resolveTaskClickIntent(e as unknown as ClickEventLike, window.getSelection());
        if (intent) {
            vscode.postMessage({
                command: 'openTask',
                file: intent.file,
                line: intent.line
            });
        }
    });

    function renderAgenda(days: DayAgenda[]): string {
        const today = toIsoDate(new Date());
        // The payload comes from an external process, so its top level is
        // checked the same way the card models check theirs (agendaDaySummary,
        // agendaTaskGroups, agendaMonthCells): a non-array from a mismatched
        // extractor renders as empty, not as a TypeError that blanks the panel.
        const list = Array.isArray(days) ? days : [];
        // Array-of-fragments + join instead of string += because V8 keeps
        // re-allocating on each concat for the longest payload that reaches
        // here: a week is 7 days * 4 buckets * N tasks. (The month view renders
        // through renderMonthCalendar, not this function.) Output is identical.
        const parts: string[] = [];
        list.forEach((day) => {
            const isToday = day.date === today;
            const headerCls = 'day-header' + (isToday ? ' day-header-today' : '');
            parts.push(
                '<div class="' +
                    headerCls +
                    '" data-date="' +
                    escapeHtml(day.date) +
                    '">' +
                    formatDayHeader(day.date) +
                    '</div>'
            );
            (day.overdue || []).forEach((task) => parts.push(renderTask(task, task.days_offset, 'overdue')));
            (day.scheduled_timed || []).forEach((task) => parts.push(renderTask(task, task.days_offset)));
            (day.scheduled_no_time || []).forEach((task) => parts.push(renderTask(task, task.days_offset)));
            (day.upcoming || []).forEach((task) => parts.push(renderTask(task, task.days_offset, 'upcoming')));
        });
        return parts.join('');
    }

    // Day view (Nav "A" companion): a single day rendered as a summary bar plus
    // stacked section panels (Scheduled today / All-day & upcoming / Overdue),
    // with Overdue LAST at the bottom. computeDaySummary and buildDaySections
    // are the inlined, unit-tested source of truth for the counts and section
    // order. Task rows still go through renderTask, so click handling carries
    // over.
    function renderDayCard(days: DayAgenda[]): string {
        const day: DayAgenda = days?.[0] ?? {
            date: '',
            overdue: [],
            scheduled_timed: [],
            scheduled_no_time: [],
            upcoming: []
        };
        const summary = computeDaySummary(day);
        const sections = buildDaySections(day, UI.sections);

        const pieces = [summaryStat(summary.total, UI.summary.tasks, '')];
        if (summary.overdue > 0) {
            pieces.push(summaryStat(summary.overdue, UI.summary.overdue, 'day-summary-overdue'));
        }
        if (summary.done > 0) {
            pieces.push(summaryStat(summary.done, UI.summary.done, 'day-summary-done'));
        }
        // The summary bar carries data-date: it is the day view's single
        // anchor-date element (getRenderedInfo contract). Its content is the
        // count summary, not the date -- the nav hero already shows the date.
        const summaryHtml = renderSummaryBar(day.date, pieces);

        if (sections.length === 0) {
            return (
                '<div class="day-card" data-card="day">' +
                summaryHtml +
                '<div class="day-empty">' +
                escapeHtml(UI.empty.day) +
                '</div></div>'
            );
        }

        const sectionsHtml = sections
            .map((sec) => {
                const rows = sec.items
                    .map((it) => {
                        const taskType =
                            it.kind === 'overdue' ? 'overdue' : it.kind === 'upcoming' ? 'upcoming' : undefined;
                        return renderTask(it.task, it.task.days_offset, taskType);
                    })
                    .join('');
                return renderSectionPanel(sec.key, sec.title, sec.items.length, rows);
            })
            .join('');
        return '<div class="day-card" data-card="day">' + summaryHtml + sectionsHtml + '</div>';
    }

    // ---- shared card chrome (Day and Tasks views) ----
    // Both views stack section panels under a sticky summary bar and render
    // their rows as standard .task-line elements, so the markup lives here once
    // instead of being duplicated per view.

    // One "<b>N</b> word" stat for the summary bar. The word argument is either
    // a plain qualifier ("overdue") or the plural forms of a counted noun
    // (["task","tasks"] in English, three forms in Russian).
    function summaryStat(n: number, word: string | string[], cls: string): string {
        const label = Array.isArray(word) ? word[pluralIndex(n, uiLang)] : word;
        return (
            '<span class="day-summary-stat' +
            (cls ? ' ' + cls : '') +
            '"><b>' +
            n +
            '</b> ' +
            escapeHtml(label) +
            '</span>'
        );
    }

    // The bar reuses the sticky .day-header shell. dateIso is the view's anchor
    // date for the day view and empty for the date-less tasks view, which then
    // emits no data-date (getRenderedInfo only collects headers that carry one).
    function renderSummaryBar(dateIso: string, pieces: string[]): string {
        const dateAttr = dateIso ? ' data-date="' + escapeHtml(dateIso) + '"' : '';
        return (
            '<div class="day-header day-summary"' +
            dateAttr +
            '>' +
            pieces.join('<span class="day-summary-sep">·</span>') +
            '</div>'
        );
    }

    /** One section panel: title, count chip and the already-rendered rows. */
    function renderSectionPanel(key: string, title: string, count: number, rowsHtml: string): string {
        return (
            '<section class="day-section day-section-' +
            key +
            '">' +
            '<div class="day-section-head">' +
            '<span class="day-section-name">' +
            escapeHtml(title) +
            '</span>' +
            // Same component as the month cell's task-load chip, so it explains
            // its number the same way.
            '<span class="day-section-count" title="' +
            escapeHtml(formatString(UI.countChip.inSection, countLabel(count, UI.countChip.tasks))) +
            '">' +
            count +
            '</span>' +
            '</div>' +
            '<div class="day-section-body">' +
            rowsHtml +
            '</div>' +
            '</section>'
        );
    }

    // The week view scrolls to today's header when today is in the visible
    // range; when the user navigates to another week (Prev/Next moved them off
    // the current week), it starts at the top instead of landing them mid-week
    // on the day-of-week that happens to share shiftedToday. Day/month/tasks
    // have no equivalent per-day anchor.
    function currentWeekIsVisible(): boolean {
        return !!document.querySelector('.day-header[data-date="' + toIsoDate(new Date()) + '"]');
    }

    function scrollToWeekFocus(): void {
        if (initialMode !== 'week') {
            return;
        }
        requestAnimationFrame(() => {
            const target = document.querySelector('.day-header[data-date="' + toIsoDate(new Date()) + '"]');
            if (target) {
                target.scrollIntoView({ block: 'start', behavior: 'auto' });
            } else {
                window.scrollTo(0, 0);
            }
        });
    }

    // Tasks view (date-less --tasks mode): the same card vocabulary as the Day
    // view -- a sticky summary bar plus stacked section panels -- but grouped by
    // the org priority cookie instead of by schedule bucket, and without an
    // anchor date. computeTasksSummary and buildTaskGroups are the inlined,
    // unit-tested source of truth for the counts and the group order (A, B, C,
    // then the unprioritised backlog).
    function renderTasks(tasks: Task[]): string {
        const summary = computeTasksSummary(tasks);
        const groups = buildTaskGroups(tasks, UI.groups);

        const pieces = [summaryStat(summary.total, UI.summary.tasks, '')];
        if (summary.highPriority > 0) {
            pieces.push(summaryStat(summary.highPriority, UI.summary.priorityA, 'day-summary-high'));
        }
        if (summary.done > 0) {
            pieces.push(summaryStat(summary.done, UI.summary.done, 'day-summary-done'));
        }
        const summaryHtml = renderSummaryBar('', pieces);

        if (groups.length === 0) {
            return (
                '<div class="day-card" data-card="tasks">' +
                summaryHtml +
                '<div class="day-empty">' +
                escapeHtml(UI.empty.tasks) +
                '</div></div>'
            );
        }

        // Group key -> section key: "pa"/"pb"/"pc"/"pnone", which the style sheet
        // tints to match the priority chip colours.
        const groupsHtml = groups
            .map((group) => {
                const rows = group.items.map((task) => renderTask(task)).join('');
                return renderSectionPanel('p' + group.key, group.title, group.items.length, rows);
            })
            .join('');
        return '<div class="day-card" data-card="tasks">' + summaryHtml + groupsHtml + '</div>';
    }

    function formatDayHeader(date: string): string {
        const { weekday, day, month, year } = formatDayHeaderParts(date, locale);
        return (
            '<span class="day-weekday">' +
            weekday +
            '</span>' +
            '<span class="day-num">' +
            day +
            '</span>' +
            '<span class="day-rest">' +
            month +
            ' ' +
            year +
            '</span>'
        );
    }

    function renderTask(task: TaskWithOffset, daysOffset?: number, taskType?: string): string {
        const status = task.task_type || '';
        const priorityLetter = task.priority || '';
        const statusKind =
            status === 'TODO' ? 'todo' : status === 'DONE' ? 'done' : isCancelled(status) ? 'cancelled' : '';
        // Escaped once and used in both the row and the chip: this is the
        // hottest string in the renderer (a month view emits it per task).
        const priorityAttr = escapeHtml(priorityLetter.toLowerCase());
        const flag = resolveTaskFlag(task, isCancelled);
        const attention = resolveAttentionLevel(task, daysOffset, taskType, isCancelled);

        const dateDisplay =
            daysOffset !== undefined && daysOffset !== 0 && task.timestamp_date
                ? formatDateForTitle(task.timestamp_date)
                : '';
        const dateDir = taskType === 'upcoming' ? 'upcoming' : 'overdue';
        // Source of truth: src/utils/agendaHeadingTint.ts -- unit tested.
        // typeAttr feeds the [data-type="deadline"] selector that paints the
        // heading red for a DEADLINE task; resolveHeadingClass still owns the
        // DEADLINE > priority > default precedence rule.
        const typeAttr = resolveHeadingClass(task).includes('deadline') ? 'deadline' : 'scheduled';

        return (
            '<div class="task-line"' +
            ' data-status="' +
            statusKind +
            '"' +
            ' data-priority="' +
            priorityAttr +
            '"' +
            ' data-type="' +
            typeAttr +
            '"' +
            ' data-file="' +
            escapeHtml(task.file) +
            '"' +
            ' data-line="' +
            sanitizeTaskLine(task.line) +
            '">' +
            // The big-time column: a clean HH:MM, or empty for an all-day task
            // (the stylesheet then fills in an em-dash placeholder).
            '<span class="time-plain">' +
            escapeHtml(task.timestamp_time || '') +
            '</span>' +
            '<span class="status" data-status="' +
            statusKind +
            '" data-attention="' +
            attention +
            '" title="' +
            escapeHtml(attentionTooltip(attention, UI.tooltips)) +
            '">' +
            escapeHtml(status) +
            '</span>' +
            // .flag: the type glyph (deadline/scheduled/repeat/cancelled).
            '<span class="flag" data-flag="' +
            flag +
            '" title="' +
            escapeHtml(flagTooltip(flag, UI.tooltips, formatString, formatDateForTitle, task)) +
            '"></span>' +
            '<span class="priority" data-priority="' +
            priorityAttr +
            '" title="' +
            escapeHtml(priorityTooltip(priorityLetter, UI.tooltips, formatString)) +
            '">' +
            escapeHtml(priorityLetter) +
            '</span>' +
            '<span class="heading">' +
            escapeHtml(task.heading) +
            '</span>' +
            '<span class="offset" data-dir="' +
            dateDir +
            '">' +
            dateDisplay +
            '</span>' +
            '</div>'
        );
    }

    /**
     * The date shown in a row's offset column and in the flag tooltips, in the
     * configured locale's numeric order. Bound here so both places -- and the
     * tooltip helper, which takes it as an argument -- cannot drift apart.
     *
     * Results are memoised by ISO date, and the cache is dropped when the locale
     * changes. `formatIsoDate` builds an `Intl.DateTimeFormat` per call, which
     * costs far more than the formatting itself; a render calls it two or three
     * times per task row, while a week has at most 7 distinct dates and a month
     * about 31. The cache lives in this closure, not at module scope: the helper
     * modules are inlined into the page through `.toString()` and bring no
     * module scope with them.
     */
    let dateTitleCache: Record<string, string> = {};
    let dateTitleCacheLocale = locale;
    function formatDateForTitle(dateStr: string): string {
        if (dateTitleCacheLocale !== locale) {
            dateTitleCache = {};
            dateTitleCacheLocale = locale;
        }
        const hit = dateTitleCache[dateStr];
        if (hit !== undefined) {
            return hit;
        }
        const formatted = formatIsoDate(dateStr, locale);
        dateTitleCache[dateStr] = formatted;
        return formatted;
    }

    function resolveFirstDayOffset(): number {
        // 0 = Sunday-first, 1 = Monday-first (only these two supported in UI).
        if (firstDayOfWeek === 'sunday') {
            return 0;
        }
        if (firstDayOfWeek === 'monday') {
            return 1;
        }
        try {
            const info = (new Intl.Locale(locale) as unknown as LocaleWithWeekInfo).weekInfo;
            if (info && info.firstDay === 7) {
                return 0;
            }
            if (info && info.firstDay !== undefined && info.firstDay >= 1 && info.firstDay <= 6) {
                return 1;
            }
        } catch {
            // Unsupported locale or API -- fall through to the Monday default.
        }
        return 1;
    }

    function buildWeekdayLabels(firstOffset: number): string[] {
        // Reference week starting Sun 2024-01-07 lets us pick weekday names by locale.
        const labels: string[] = [];
        for (let i = 0; i < CALENDAR_COLS; i++) {
            const ref = new Date(2024, 0, 7 + ((i + firstOffset) % CALENDAR_COLS));
            labels.push(ref.toLocaleDateString(locale, { weekday: 'short' }));
        }
        return labels;
    }

    // Opening tag of a calendar cell. Every cell -- including the padding days
    // of the neighbouring months -- drills down into the Day view, the same
    // operation the week day-header offers, so all of them are buttons and all
    // carry that header's tooltip.
    function calendarCellOpenTag(classes: string, dateStr: string): string {
        return (
            '<button type="button" class="' +
            classes +
            '" data-date="' +
            dateStr +
            '" title="' +
            escapeHtml(UI.openDayView) +
            '">'
        );
    }

    function renderMonthCalendar(days: DayAgenda[]): string {
        // date -> { total, overdue }; a missing date means an empty day.
        // buildMonthDayIndex is the inlined, unit-tested source of truth.
        const daysMap = buildMonthDayIndex(days);

        const target = shiftedToday ? parseLocalDate(shiftedToday) : new Date();
        const year = target.getFullYear();
        const month = target.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        const firstOffset = resolveFirstDayOffset();
        // JS getDay(): 0=Sun..6=Sat. Convert to leading-empty-cells count.
        const startDay = (firstDayOfMonth.getDay() - firstOffset + CALENDAR_COLS) % CALENDAR_COLS;

        const today = new Date();
        const todayStr = toIsoDate(today);

        let html = '<div class="calendar">';
        buildWeekdayLabels(firstOffset).forEach((label) => {
            html += '<div class="calendar-header">' + escapeHtml(label) + '</div>';
        });

        const prevMonthLast = new Date(year, month, 0);
        const prevMonthDays = prevMonthLast.getDate();
        for (let i = startDay - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const d = new Date(year, month - 1, day);
            const dateStr = toIsoDate(d);
            html +=
                calendarCellOpenTag('calendar-day other-month', dateStr) +
                '<div class="day-number">' +
                escapeHtml(formatNumber(day, locale)) +
                '</div></button>';
        }

        for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
            const d = new Date(year, month, day);
            const dateStr = toIsoDate(d);
            const dayOfWeek = d.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHol = isHoliday(dateStr);
            const counts = daysMap[dateStr];
            const isToday = dateStr === todayStr;

            let classes = 'calendar-day';
            if (isWeekend) {
                classes += ' weekend';
            }
            if (isHol) {
                classes += ' holiday';
            }
            if (counts) {
                classes += ' has-tasks';
            }
            if (isToday) {
                classes += ' today';
            }

            // Task load is a count chip, not a binary dot: the number says how
            // full the day is at a glance, and the chip turns red when any of
            // that day's work is overdue.
            const chipTitle = counts
                ? countLabel(counts.total, UI.countChip.tasks) +
                  (counts.overdue > 0
                      ? ', ' + formatString(UI.countChip.overdue, formatNumber(counts.overdue, locale))
                      : '')
                : '';
            const chip = counts
                ? '<div class="task-count' +
                  (counts.overdue > 0 ? ' task-count-overdue' : '') +
                  '"' +
                  ' title="' +
                  escapeHtml(chipTitle) +
                  '">' +
                  escapeHtml(formatNumber(counts.total, locale)) +
                  '</div>'
                : '';

            html +=
                calendarCellOpenTag(classes, dateStr) +
                '<div class="day-number">' +
                escapeHtml(formatNumber(day, locale)) +
                '</div>' +
                chip +
                '</button>';
        }

        // Pad trailing cells up to the next full week boundary -- gives 4/5/6 rows naturally.
        const used = startDay + lastDayOfMonth.getDate();
        const trailingCells = (CALENDAR_COLS - (used % CALENDAR_COLS)) % CALENDAR_COLS;
        for (let i = 1; i <= trailingCells; i++) {
            const d = new Date(year, month + 1, i);
            const dateStr = toIsoDate(d);
            html +=
                calendarCellOpenTag('calendar-day other-month', dateStr) +
                '<div class="day-number">' +
                escapeHtml(formatNumber(i, locale)) +
                '</div></button>';
        }

        html += '</div>';
        return html;
    }

    function navigate(offset: number): void {
        // Remember the scroll position for the current anchor before leaving it,
        // so a later return to this anchor can restore it.
        rememberScroll(scrollHistory, shiftedToday, window.scrollY);
        const d = parseLocalDate(shiftedToday);
        if (offset === 0) {
            d.setTime(Date.now());
        } else if (initialMode === 'day') {
            d.setDate(d.getDate() + offset);
        } else if (initialMode === 'week') {
            d.setDate(d.getDate() + offset * 7);
        }
        const newDate = initialMode === 'month' && offset !== 0 ? toIsoDate(shiftMonthAnchor(d, offset)) : toIsoDate(d);
        // Today is an explicit "snap to today" -- drop any remembered scroll for
        // that anchor so the update handler falls back to scrollToWeekFocus()
        // instead of restoring an old position.
        if (offset === 0) {
            delete scrollHistory[newDate];
        }
        vscode.postMessage({ command: 'navigate', date: newDate });
    }

    function renderModeSwitch(): string {
        const modes = [
            { id: 'day', label: UI.modes.day },
            { id: 'week', label: UI.modes.week },
            { id: 'month', label: UI.modes.month },
            { id: 'tasks', label: UI.modes.tasks }
        ];
        return (
            '<span class="mode-seg">' +
            modes
                .map(
                    (m) =>
                        '<button class="seg-item' +
                        (m.id === initialMode ? ' active' : '') +
                        '" data-mode="' +
                        m.id +
                        '" title="' +
                        escapeHtml(formatString(UI.switchToView, m.label)) +
                        '">' +
                        escapeHtml(m.label) +
                        '</button>'
                )
                .join('') +
            '</span>'
        );
    }

    // The implicit "no filter" tag is stored as ALL but shown translated;
    // user-defined tag names are shown as configured.
    function tagLabel(name: string): string {
        return name === 'ALL' ? UI.tagAll : name;
    }

    function tagButtonText(tag: string): string {
        return formatString(UI.tagButton, tagLabel(tag)) + ' ▾';
    }

    // The file-tag dropdown: a collapsed button plus a list of tags. The ids and
    // the data-tag attribute are hardcoded because the click handlers
    // (toggleMenu, attachTagMenuListeners) address them directly -- a second
    // dropdown would need its own handlers anyway.
    function renderTagMenu(): string {
        const rows = availableTags
            .map((name) => {
                const title = name === 'ALL' ? UI.tagAllTitle : formatString(UI.tagFilterTitle, name);
                return (
                    // A dropdown row behaves like a button, so it is one: that
                    // is what gives it Tab focus and Enter/Space activation,
                    // matching the mode segment next to it.
                    '<button type="button" class="tag-menu-item' +
                    (name === currentTag ? ' active' : '') +
                    '" data-tag="' +
                    escapeHtml(name) +
                    '" title="' +
                    escapeHtml(title) +
                    '">' +
                    '<span class="tag-menu-check">✓</span>' +
                    escapeHtml(tagLabel(name)) +
                    '</button>'
                );
            })
            .join('');
        return (
            '<div class="tag-menu" id="tagMenu">' +
            '<button class="tag-menu-btn" id="tagMenuBtn" title="' +
            escapeHtml(UI.tagCaption) +
            '">' +
            escapeHtml(tagButtonText(currentTag)) +
            '</button>' +
            '<div class="tag-menu-list">' +
            '<div class="tag-menu-label">' +
            escapeHtml(UI.tagCaption) +
            '</div>' +
            rows +
            '</div></div>'
        );
    }

    function setTag(tag: string): void {
        currentTag = tag;
        // Mirror the live choice onto the collapsed button and the active marker
        // without waiting for the host round-trip; scoped to #tagMenu so no other
        // dropdown is touched.
        document.querySelectorAll('#tagMenu .tag-menu-item').forEach(function (el) {
            el.classList.toggle('active', el.getAttribute('data-tag') === tag);
        });
        const btn = document.getElementById('tagMenuBtn');
        if (btn) {
            btn.textContent = tagButtonText(tag);
        }
        vscode.postMessage({ command: 'setTag', tag: tag });
    }

    function attachTagMenuListeners(): void {
        const btn = document.getElementById('tagMenuBtn');
        if (btn) {
            btn.addEventListener('click', (ev) => toggleMenu(ev, 'tagMenu'));
        }
        document.querySelectorAll('#tagMenu .tag-menu-item').forEach((el) => {
            el.addEventListener('click', () => {
                const tag = el.getAttribute('data-tag');
                if (tag) {
                    setTag(tag);
                }
            });
        });
    }

    /**
     * The header-layout button: it names the current mode and cycles it
     * (auto -> full -> compact) on click. The setting exists for a panel too
     * short for the full header, which is exactly when reaching for the
     * settings editor is most awkward; the tooltip names what one click gives,
     * so the cycle is legible without trying it.
     */
    function renderHeaderModeButton(): string {
        const mode: 'auto' | 'full' | 'compact' =
            headerMode === 'full' || headerMode === 'compact' ? headerMode : 'auto';
        const next = nextHeaderMode(mode);
        const label = formatString(UI.headerModeButton, UI.headerModes[mode]);
        const title = formatString(UI.headerModeTitle, UI.headerModes[mode], UI.headerModes[next]);
        return (
            '<button class="chip-btn" id="headerModeBtn" title="' +
            escapeHtml(title) +
            '" aria-label="' +
            escapeHtml(title) +
            '">' +
            escapeHtml(label) +
            '</button>'
        );
    }

    /**
     * Re-label the header-layout button in place after the setting changed.
     * Rebuilding the whole nav-bar would work too, but it also rebuilds the
     * hero title and the tag dropdown, and the layout change is meant to be a
     * reflow rather than a re-render.
     */
    function refreshHeaderModeButton(): void {
        const btn = document.getElementById('headerModeBtn');
        if (!btn) {
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderHeaderModeButton();
        const fresh = wrapper.firstElementChild;
        if (fresh) {
            btn.textContent = fresh.textContent;
            const title = fresh.getAttribute('title') ?? '';
            btn.setAttribute('title', title);
            btn.setAttribute('aria-label', title);
        }
    }

    function attachModeSwitchListeners(): void {
        document.querySelectorAll('.seg-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-mode');
                if (target && target !== initialMode) {
                    vscode.postMessage({ command: 'switchMode', mode: target });
                }
            });
        });
    }

    function renderNavBar(): void {
        const navBar = document.getElementById('nav-bar');
        const heroEl = document.getElementById('current-date');
        if (!navBar || !heroEl) {
            return;
        }
        const modeSwitchHtml = renderModeSwitch();
        const tagHtml = renderTagMenu();
        // The header-layout button and the Tag picker sit at the right edge of
        // the control row.
        const chipsHtml = '<span class="nav-spacer"></span>' + renderHeaderModeButton() + tagHtml;

        // View history (Back/Forward over {mode, date} states). It has keyboard
        // shortcuts, but every other navigation in the panel is a visible
        // button, and the commands only appear in the Command Palette while the
        // agenda has focus -- so without these two the feature is unreachable
        // unless you already know it exists. The tooltips name the default
        // chords, which is where the user learns them.
        const historyHtml =
            '<span class="date-nav history-nav">' +
            '<button class="nav-btn nav-btn-arrow" id="btn-history-back" title="' +
            escapeHtml(formatString(UI.historyBack, 'Alt+Shift+-')) +
            '" aria-label="' +
            escapeHtml(formatString(UI.historyBack, 'Alt+Shift+-')) +
            '">⟨</button>' +
            '<button class="nav-btn nav-btn-arrow" id="btn-history-forward" title="' +
            escapeHtml(formatString(UI.historyForward, 'Alt+Shift+=')) +
            '" aria-label="' +
            escapeHtml(formatString(UI.historyForward, 'Alt+Shift+=')) +
            '">⟩</button>' +
            '</span>';

        // resolveHeroModel (inlined, unit-tested) decides the title shape and
        // whether the TODAY badge shows; Intl formatting of the actual text stays
        // here where the locale lives.
        const hero = resolveHeroModel(initialMode, shiftedToday, toIsoDate(new Date()));
        const badge = hero.showToday ? '<span class="hero-badge">' + escapeHtml(UI.todayBadge) + '</span>' : '';

        // Date navigation (Prev/Today/Next) exists for every mode except Tasks.
        // In the full header the mode segment and this control row live on two
        // separate rows (per the approved Nav "A" mockup), so the underline
        // segment does not share a baseline with the boxed nav buttons; the
        // compact header folds them onto one row through CSS alone -- the markup
        // built here is the same in both layouts.
        let dateNavHtml = '';
        if (hero.kind === 'tasks') {
            heroEl.innerHTML = '<div class="hero-title">' + escapeHtml(UI.modes.tasks) + '</div>';
        } else {
            const d = parseLocalDate(shiftedToday);
            if (hero.kind === 'month') {
                const monthName = d.toLocaleDateString(locale, { month: 'long' });
                heroEl.innerHTML =
                    '<div class="hero-title">' +
                    escapeHtml(monthName) +
                    '</div>' +
                    '<div class="hero-sub"><span>' +
                    escapeHtml(formatNumber(d.getFullYear(), locale)) +
                    '</span>' +
                    badge +
                    '</div>';
            } else {
                const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
                const dayMonth = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
                heroEl.innerHTML =
                    '<div class="hero-title">' +
                    escapeHtml(weekday) +
                    '</div>' +
                    '<div class="hero-sub"><span>' +
                    escapeHtml(dayMonth + ' ' + formatNumber(d.getFullYear(), locale)) +
                    '</span>' +
                    badge +
                    '</div>';
            }

            // Prev/Next wording is per unit, not a "Previous {unit}" template: in
            // some languages the adjective agrees with the noun's gender (ru:
            // "Предыдущий день" / "Предыдущая неделя").
            const unit = initialMode === 'day' ? 'day' : initialMode === 'week' ? 'week' : 'month';
            const prevTitle = escapeHtml(UI.navPrev[unit]);
            const nextTitle = escapeHtml(UI.navNext[unit]);
            dateNavHtml =
                '<span class="date-nav">' +
                '<button class="nav-btn nav-btn-arrow" id="btn-prev" title="' +
                prevTitle +
                '" aria-label="' +
                prevTitle +
                '">‹</button>' +
                '<button class="nav-btn nav-btn-today" id="btn-today" title="' +
                escapeHtml(UI.navTodayTitle) +
                '">' +
                escapeHtml(UI.navToday) +
                '</button>' +
                '<button class="nav-btn nav-btn-arrow" id="btn-next" title="' +
                nextTitle +
                '" aria-label="' +
                nextTitle +
                '">›</button>' +
                '</span>';
        }

        navBar.innerHTML =
            '<div class="seg-row">' +
            modeSwitchHtml +
            '</div>' +
            '<div class="control-row">' +
            historyHtml +
            dateNavHtml +
            chipsHtml +
            '</div>';

        if (hero.kind !== 'tasks') {
            document.getElementById('btn-prev')?.addEventListener('click', () => navigate(-1));
            document.getElementById('btn-today')?.addEventListener('click', () => navigate(0));
            document.getElementById('btn-next')?.addEventListener('click', () => navigate(1));
        }
        document.getElementById('btn-history-back')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'historyBack' });
        });
        document.getElementById('btn-history-forward')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'historyForward' });
        });
        document.getElementById('headerModeBtn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'cycleHeaderMode' });
        });

        attachModeSwitchListeners();
        attachTagMenuListeners();
    }
}
