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

import type {
    AgendaData,
    AgendaGitStatus,
    DayAgenda,
    GitFileState,
    GitRepoState,
    Task,
    TaskWithOffset
} from '../types';
import type { AgendaStrings } from '../utils/agendaI18n';
/**
 * What the git markup helpers take besides the status.
 *
 * Spelled out here rather than imported from `agendaGitHtml.ts`: that module
 * belongs to the host project and reaches (transitively) for `node:path`, which
 * a page does not have. The same reason every other helper signature in this
 * file is written out structurally.
 */
interface GitHtmlContext {
    git: AgendaStrings['git'];
    locale: string;
    uiLang: string;
    escapeHtml: (text: string | number | boolean | undefined | null) => string;
    formatString: (template: string, ...values: string[]) => string;
    formatNumber: (value: number, locale: string) => string;
    pluralIndex: (n: number, lang: string) => number;
}

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
export type ScrollMemory = Record<string, number>;

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

/** One of several scanned directories, as a row refers to it. */
export interface CollectionMark {
    root: string;
    name: string;
    tone: number;
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

/** The overdue backlog is four panels rather than one; see agendaDaySummary. */
export type DaySectionKey =
    'scheduled' | 'allday' | 'overdue-repeat' | 'overdue-recent' | 'overdue-earlier' | 'overdue-long';

export interface DaySection {
    key: DaySectionKey;
    title: string;
    items: DaySectionItem[];
}

/** Day-card panel titles (see `AgendaStrings.sections`). */
export interface DaySectionLabels {
    scheduled: string;
    allday: string;
    overdueRepeat: string;
    overdueRecent: string;
    overdueEarlier: string;
    overdueLong: string;
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

/** One laid-out cell of the month grid, as `buildMonthGrid` returns them. */
export interface MonthCellLike {
    date: string;
    dayNumber: number;
    otherMonth: boolean;
    weekend: boolean;
    today: boolean;
}

/** Day-header element subset the week-view drill-down wiring touches. */
export interface DayHeaderElementLike {
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    classList: { add(token: string): void };
    addEventListener(type: 'click', listener: () => void): void;
}

/** Root that can query for day-header elements (a Document or a container). */
export interface DayHeaderRootLike {
    querySelectorAll(selectors: string): Iterable<DayHeaderElementLike>;
}

/** Window subset `focusStickyAnchor` drives. */
export interface ScrollWindowLike {
    scrollTo(x: number, y: number): void;
}

/** Element subset it scrolls to. */
export interface StickyAnchorLike {
    scrollIntoView(options: { block: 'start'; behavior: 'auto' }): void;
}

/** A row's vertical extent in viewport coordinates. */
export interface ClipRectLike {
    top: number;
    bottom: number;
}

/** Rows of one day that are out of sight, split by which edge hides them. */
export interface ClipCounts {
    above: number;
    below: number;
}

/** Chip element a day header carries for one of the two counts. */
export interface ClipChipLike {
    textContent: string | null;
    hidden: boolean;
    setAttribute(name: string, value: string): void;
}

/** Node subset the clipping pass walks over. */
export interface ClipNodeLike {
    classList: { contains(token: string): boolean; toggle(token: string, force: boolean): void };
    getBoundingClientRect(): ClipRectLike;
    querySelector(selectors: string): ClipChipLike | null;
    nextElementSibling: ClipNodeLike | null;
}

/** Root that can query for the day headers to refresh. */
export interface ClipRootLike {
    querySelectorAll(selectors: string): Iterable<ClipNodeLike>;
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
    escapeHtml: (text: string | number | boolean | undefined | null) => string;
    rememberScroll: (history: ScrollMemory, anchor: string, scrollY: number) => void;
    recallScroll: (history: ScrollMemory, anchor: string) => number | null;
    focusStickyAnchor: (win: ScrollWindowLike, target: StickyAnchorLike | null) => void;
    countClippedRows: (rows: ClipRectLike[], headerBottom: number, viewportHeight: number) => ClipCounts;
    renderDayClipHtml: () => string;
    updateDayClipMarkers: (
        root: ClipRootLike,
        viewportHeight: number,
        titles: { above: string; below: string },
        countRows: (rows: ClipRectLike[], headerBottom: number, viewportHeight: number) => ClipCounts,
        format: (template: string, ...values: string[]) => string,
        formatCount: (n: number) => string
    ) => void;
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
    countLabel: (
        n: number,
        forms: string[],
        ctx: {
            locale: string;
            uiLang: string;
            formatNumber: (value: number, locale: string) => string;
            pluralIndex: (n: number, lang: string) => number;
        }
    ) => string;
    summaryStat: (
        n: number,
        word: string | string[],
        cls: string,
        ctx: {
            locale: string;
            uiLang: string;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatNumber: (value: number, locale: string) => string;
            pluralIndex: (n: number, lang: string) => number;
        }
    ) => string;
    renderSummaryBar: (
        dateIso: string,
        pieces: string[],
        ctx: { escapeHtml: (text: string | number | boolean | undefined | null) => string }
    ) => string;
    renderSectionPanel: (
        key: string,
        title: string,
        count: number,
        rowsHtml: string,
        ctx: {
            locale: string;
            uiLang: string;
            inSectionTemplate: string;
            taskForms: string[];
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
            formatNumber: (value: number, locale: string) => string;
            pluralIndex: (n: number, lang: string) => number;
        },
        actionsHtml: string
    ) => string;
    renderGroupMenu: (
        sectionKey: string,
        sectionTitle: string,
        ctx: {
            strings: AgendaStrings['group'];
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
        }
    ) => string;
    renderDayHeaderHtml: (parts: DayHeaderParts) => string;
    renderModeSwitch: (
        activeMode: string,
        ctx: {
            modes: AgendaStrings['modes'];
            switchToView: string;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
        }
    ) => string;
    /** Called by `renderTagMenu`; not invoked directly by the client. */
    tagLabel: (name: string, allLabel: string) => string;
    /** Also called on its own, to re-label the collapsed button after a pick. */
    tagButtonText: (
        tag: string,
        ctx: { tagAll: string; tagButton: string; formatString: (template: string, ...values: string[]) => string }
    ) => string;
    renderTagMenu: (
        tags: readonly string[],
        currentTag: string,
        ctx: {
            tagAll: string;
            tagAllTitle: string;
            tagButton: string;
            tagCaption: string;
            tagFilterTitle: string;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
        }
    ) => string;
    renderHeaderModeButton: (
        mode: string | undefined,
        ctx: {
            headerModeButton: string;
            headerModeTitle: string;
            headerModes: AgendaStrings['headerModes'];
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
            nextHeaderMode: (value: string | undefined) => 'auto' | 'full' | 'compact';
        }
    ) => string;
    renderDateNav: (
        unit: 'day' | 'week' | 'month',
        ctx: {
            navPrev: AgendaStrings['navPrev'];
            navNext: AgendaStrings['navNext'];
            navToday: string;
            navTodayTitle: string;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
        }
    ) => string;
    renderHeroHtml: (
        parts: { title: string; sub?: string; badge?: string },
        ctx: { escapeHtml: (text: string | number | boolean | undefined | null) => string }
    ) => string;
    renderNavBarHtml: (parts: { modeSwitch: string; dateNav: string; chips: string }) => string;
    buildMonthGrid: (anchorIso: string, firstOffset: number, todayIso: string) => MonthCellLike[];
    resolveFirstDayOffset: (firstDayOfWeek: string, locale: string) => number;
    buildWeekdayLabels: (firstOffset: number, locale: string) => string[];
    /** Called by `renderMonthCalendar`; not invoked directly by the client. */
    calendarCellOpenTag: (
        classes: string,
        dateStr: string,
        ctx: { openDayView: string; escapeHtml: (text: string | number | boolean | undefined | null) => string }
    ) => string;
    renderTaskRow: (
        task: TaskWithOffset,
        daysOffset: number | undefined,
        taskType: string | undefined,
        ctx: {
            tooltips: TooltipStrings;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
            formatDate: (iso: string) => string;
            sanitizeTaskLine: (value: unknown) => number;
            isCancelled: (status: string | undefined) => boolean;
            resolveTaskFlag: (task: Task, isCancelled: (status: string | undefined) => boolean) => string;
            resolveAttentionLevel: (
                task: Task,
                daysOffset: number | undefined,
                taskType: string | undefined,
                isCancelled: (status: string | undefined) => boolean
            ) => string;
            resolveHeadingClass: (task: HeadingTintInput) => string;
            attentionTooltip: (level: string, strings: TooltipStrings) => string;
            flagTooltip: (
                flag: string,
                strings: TooltipStrings,
                fill: (template: string, ...values: string[]) => string,
                fmtDate: (iso: string) => string,
                task?: FlagTooltipTask
            ) => string;
            priorityTooltip: (
                letter: string,
                strings: TooltipStrings,
                fill: (template: string, ...values: string[]) => string
            ) => string;
            collectionMark?: ((root: string | undefined) => string) | undefined;
            showDate?: 'when-offset' | 'always' | undefined;
        }
    ) => string;
    collectionMarkHtml: (
        root: string | undefined,
        marks: readonly CollectionMark[],
        ctx: {
            collectionTooltip: string;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
        }
    ) => string;
    hideCollections: (data: AgendaData, hidden: readonly string[]) => AgendaData;
    renderCollectionChips: (
        marks: readonly CollectionMark[],
        hidden: readonly string[],
        ctx: {
            chipTitle: string;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
        }
    ) => string;
    taskDateDirection: (task: Task, anchorIso: string) => 'overdue' | 'today' | 'upcoming' | undefined;
    renderCard: (
        kind: 'day' | 'tasks',
        summaryHtml: string,
        sectionsHtml: string,
        emptyText: string,
        ctx: { escapeHtml: (text: string | number | boolean | undefined | null) => string }
    ) => string;
    renderMonthCalendar: (
        cells: readonly MonthCellLike[],
        weekdayLabels: readonly string[],
        ctx: {
            locale: string;
            uiLang: string;
            openDayView: string;
            taskChipForms: string[];
            overdueChipTemplate: string;
            index: MonthDayIndex;
            isHoliday: (date: string) => boolean;
            escapeHtml: (text: string | number | boolean | undefined | null) => string;
            formatString: (template: string, ...values: string[]) => string;
            formatNumber: (value: number, locale: string) => string;
            pluralIndex: (n: number, lang: string) => number;
            countLabel: (
                n: number,
                forms: string[],
                ctx: {
                    locale: string;
                    uiLang: string;
                    formatNumber: (value: number, locale: string) => string;
                    pluralIndex: (n: number, lang: string) => number;
                }
            ) => string;
        }
    ) => string;
    /**
     * The git chip and its dropdown. Only the two entry points are named here;
     * the helpers they call are inlined alongside them (see INLINED_HELPERS)
     * and reached through the page's global scope, exactly like the tag menu's.
     */
    renderGitMenu: (status: AgendaGitStatus, ctx: GitHtmlContext) => string;
    gitChipStats: (status: AgendaGitStatus, ctx: GitHtmlContext) => string;
    gitChipTitle: (status: AgendaGitStatus, ctx: GitHtmlContext) => string;
    renderGitChip: (status: AgendaGitStatus, ctx: GitHtmlContext) => string;
    gitCount: (n: number, forms: string[], ctx: GitHtmlContext) => string;
    gitGroups: (status: AgendaGitStatus, ctx: GitHtmlContext) => string;
    gitGroup: (
        kind: string,
        title: string,
        files: readonly GitFileState[],
        status: AgendaGitStatus,
        ctx: GitHtmlContext
    ) => string;
    gitUnpushedGroupTitle: (fileCount: number, status: AgendaGitStatus, ctx: GitHtmlContext) => string;
    gitFilesByRepository: (
        files: readonly GitFileState[],
        repos: readonly GitRepoState[],
        ctx: GitHtmlContext
    ) => string;
    gitFileRows: (files: readonly GitFileState[], kind: string, ctx: GitHtmlContext) => string;
    gitActions: (status: AgendaGitStatus, ctx: GitHtmlContext) => string;
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
    /**
     * The scanned directories a row can belong to, empty while one directory
     * is scanned. Sent with every payload because it is derived from the tasks
     * in it.
     */
    collections?: CollectionMark[];
    firstDayOfWeek?: string;
    headerMode?: string;
    /** `'flat'` draws a day as one list; anything else keeps the sections. */
    grouping?: string;
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
    // `null` is "there is no git here", which removes the chip; it is distinct
    // from a status whose counters are zero, which shows the clean marker.
    | { command: 'gitStatus'; status?: AgendaGitStatus | null }
    | { command: 'getRenderedInfo' }
    // Integration-test hook: the host cannot scroll the page from outside, and
    // the clipping behaviour only exists at a non-zero scroll position.
    | { command: 'setScrollForTesting'; y?: number }
    // Integration-test hook: a directory chip is only ever turned off by a
    // click inside the page, and what a test needs to see is what that click
    // leaves on screen -- so the chip is pressed rather than the state poked.
    | { command: 'clickCollectionChipForTesting'; root?: string }
    // Integration-test hook: the band menu is opened and answered by clicks in
    // the page, and what the message carries is decided there -- so the item is
    // pressed rather than the message forged.
    | { command: 'clickGroupActionForTesting'; section?: string; action?: string };

/** The payload that fills a page built from nothing. */
type InitMessage = Extract<HostMessage, { command: 'init' }>;

/** The payload that patches a page already on screen. */
type UpdateMessage = Extract<HostMessage, { command: 'update' }>;

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
        focusStickyAnchor,
        countClippedRows,
        renderDayClipHtml,
        updateDayClipMarkers,
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
        formatNumber,
        countLabel: countLabelHtml,
        summaryStat: summaryStatHtml,
        renderSummaryBar: renderSummaryBarHtml,
        renderSectionPanel: renderSectionPanelHtml,
        renderGroupMenu: renderGroupMenuHtml,
        renderDayHeaderHtml,
        renderModeSwitch,
        tagButtonText,
        renderTagMenu,
        // Aliased: the client keeps a wrapper of this one, called from two places.
        renderHeaderModeButton: renderHeaderModeButtonHtml,
        renderDateNav,
        renderHeroHtml,
        renderNavBarHtml,
        buildMonthGrid,
        resolveFirstDayOffset,
        buildWeekdayLabels,
        renderMonthCalendar,
        renderTaskRow,
        collectionMarkHtml,
        hideCollections,
        renderCollectionChips,
        taskDateDirection,
        renderCard,
        renderGitMenu
    } = deps;

    // Active UI dictionary and language. Replaced by every init/update message,
    // so changing markdown-org.uiLanguage re-renders in the new language on the
    // next Show Agenda.
    let UI: AgendaStrings = boot.strings;
    let uiLang: string = boot.language;

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
    // Which scanned directory each row belongs to, and in what colour. Empty
    // for the usual single-directory agenda, where a row carries no mark.
    let collections: CollectionMark[] = [];
    // Which of them the reader has turned off, by root. Not carried between
    // openings: a panel that opens missing half its rows, with no memory of
    // why, is worse off than one that opens whole.
    let hiddenCollections: string[] = [];
    let firstDayOfWeek = 'monday';
    // How a day is grouped: 'sections' | 'flat' (markdown-org.agendaGrouping).
    // 'flat' drops the headings and the group menus that ride on them; the rows
    // themselves, and the order they are read in, are the same either way.
    let grouping = 'sections';
    // Per-anchor scroll memory. Saved on every navigate() before the postMessage
    // and restored on navigation=true updates so that a round-trip (Next then
    // Prev, or Prev then Next) returns the user to where they were instead of
    // snapping back to today's header.
    const scrollHistory: ScrollMemory = {};

    // Git status of the files this view was built from, or null when there is
    // no git to report on -- which is also the state before the host's first
    // `gitStatus` message, so the header renders without a chip until then
    // rather than with an empty one.
    let gitStatus: AgendaGitStatus | null = null;

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
     * Whether the week view still owes today's header its place under the
     * agenda header.
     *
     * Focusing the week is a state to hold, not a single jump. The header keeps
     * changing height AFTER the render that focused the week: the git chip
     * arrives on its own message (see `gitStatus` above), a web font swaps in,
     * the layout flips to compact. Each of those moves the pin point the day
     * headers stick to, while the browser's scroll anchoring keeps the content
     * where it was on screen -- so today's header ends up ABOVE the new pin
     * point, sticks there, and covers the very rows the focus had just brought
     * into view. Re-applying the focus on every such resize is what keeps them
     * visible. Cleared as soon as the scroll position becomes the user's own
     * (their gesture, or a render that restores a remembered position), because
     * from then on moving the page would be taking their place away.
     */
    let weekFocusHeld = false;

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
        document.documentElement.style.setProperty('--agenda-header-h', `${h}px`);
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
        // A taller header hides one more row behind itself, so the clipping
        // chips are re-measured with the offset they are counted against -- and
        // a week that is still holding its focus is re-focused against the new
        // offset, or today's first rows would go back under the day header (see
        // weekFocusHeld).
        new ResizeObserver(() => {
            syncHeaderOffset();
            if (weekFocusHeld && initialMode === 'week') {
                applyWeekFocus();
                return;
            }
            refreshClipMarkers();
        }).observe(agendaHeaderEl);
    } else {
        window.addEventListener('resize', syncHeaderOffset);
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the FontFaceSet API is absent in older webview runtimes
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

    /** A clipping chip's number, or 0 when the chip is not on screen. */
    function readChipCount(chip: HTMLElement | null): number {
        if (!chip || chip.hidden) {
            return 0;
        }
        return Number(chip.textContent.replaceAll(/[^0-9]/g, '')) || 0;
    }

    /**
     * Is the first task row of today's day behind its own sticky header?
     *
     * This is the symptom the week view had: the header claims the day starts
     * there while its first row is already scrolled under it. `false` when
     * today has no header (another week) or no rows.
     */
    function measureTodayFirstRowHidden(): boolean {
        const header = document.querySelector('.day-header[data-date="' + toIsoDate(new Date()) + '"]');
        if (!header) {
            return false;
        }
        let node = header.nextElementSibling;
        while (node && !node.classList.contains('day-header') && !node.classList.contains('task-line')) {
            node = node.nextElementSibling;
        }
        if (!node?.classList.contains('task-line')) {
            return false;
        }
        return node.getBoundingClientRect().top < header.getBoundingClientRect().bottom - 0.5;
    }

    /**
     * The state both payloads carry, written down once.
     *
     * `init` and `update` disagree about what an absent field means, and the
     * disagreement is deliberate: `init` fills a page that shows nothing yet,
     * so a field the host left out falls back to its empty default, while
     * `update` patches a page that is already showing something, so a field
     * left out keeps what is on screen. Both rules live here because the real
     * hazard is a field that reaches one payload and not the other -- the same
     * hazard `buildInitMessage` guards against on the host side.
     */
    function applyStatePayload(message: AgendaStatePayload, kind: 'init' | 'update'): void {
        // An empty string is as absent as an undefined one: the host sends ''
        // for a setting it has no value for.
        function adopt(incoming: string | undefined, current: string): string {
            if (incoming) {
                return incoming;
            }
            return kind === 'init' ? '' : current;
        }

        // Dates follow the setting on the next render, like the dictionary
        // below -- otherwise a locale change repainted the labels but left the
        // dates formatted the old way.
        locale = adopt(message.locale, locale);
        shiftedToday = adopt(message.shiftedToday, shiftedToday);
        currentTag = adopt(message.currentTag, currentTag);
        initialMode = adopt(message.mode, initialMode);

        // These four keep what the page has in both payloads: the host sends
        // them whenever it has them, and an empty one has never meant "drop
        // what you are showing".
        if (message.availableTags) {
            availableTags = message.availableTags;
        }
        if (message.firstDayOfWeek) {
            firstDayOfWeek = message.firstDayOfWeek;
        }
        if (message.headerMode) {
            headerMode = message.headerMode;
        }
        if (message.grouping) {
            grouping = message.grouping;
        }
        if (message.strings) {
            UI = message.strings;
            // An empty language tag leaves the current one in place.
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            uiLang = message.language || uiLang;
        }

        // Replaced outright, not merged: the tasks and the set of scanned
        // directories are whatever this payload came from, and a directory that
        // no longer holds tasks must stop colouring rows.
        initialData = message.data ?? [];
        collections = message.collections ?? [];
    }

    /** A page built from nothing: render it whole and focus the week. */
    function renderFromInit(message: InitMessage): void {
        // Init-only: an update carries no holidays, and the ones the panel was
        // opened with stay in force.
        holidays = message.holidays ?? [];
        // After renderNavBar, not before: the layout is decided from the
        // header's measured height, and before the first render there is
        // nothing to measure.
        renderNavBar();
        applyHeaderLayout();
        syncHeaderOffset();
        renderCurrentMode();
        scrollToWeekFocus();
        refreshClipMarkers();
    }

    /** A page already on screen: render it again and settle where to leave it. */
    function renderFromUpdate(message: UpdateMessage): void {
        const userInitiated = message.userInitiated === true;
        const navigation = message.navigation === true;
        // Measured before the re-render, because both are about the page the
        // reader is looking at now, not the one about to replace it.
        const scrollPos = window.scrollY;
        const wasOnCurrentWeek = currentWeekIsVisible();
        renderNavBar();
        // Every mode carries its own header (a week names one day, a month
        // one month), so the share it takes is re-decided per render, not
        // only when the setting changes.
        applyHeaderLayout();
        syncHeaderOffset();
        renderCurrentMode();
        // Each branch below either focuses the week or restores a position
        // that is the user's; the latter releases the focus hold, so a later
        // header resize leaves their scroll alone (see weekFocusHeld).
        if (!userInitiated) {
            // File-watcher / cycleTag refresh -- keep scroll.
            window.scrollTo(0, scrollPos);
        } else if (initialMode !== 'week') {
            // Day / month / tasks have no per-day scroll anchor.
            weekFocusHeld = false;
        } else if (navigation) {
            // Prev/Next/Today. If we've been on this anchor before
            // (round-trip case), restore the user's last scroll there;
            // otherwise focus the week as usual.
            const remembered = recallScroll(scrollHistory, shiftedToday);
            if (remembered !== null) {
                weekFocusHeld = false;
                window.scrollTo(0, remembered);
            } else {
                scrollToWeekFocus();
            }
        } else if (wasOnCurrentWeek && currentWeekIsVisible()) {
            // Repeated Show Agenda (Week) on the same current week -- keep
            // the user's place.
            weekFocusHeld = false;
            window.scrollTo(0, scrollPos);
        } else {
            scrollToWeekFocus();
        }
        // Every branch above lands the page on a scroll position, which is
        // what the chips are counted against.
        refreshClipMarkers();
    }

    /**
     * The header-mode setting changed while the panel was open -- from the
     * settings editor, the command, or the button in the control row. Only the
     * <body> class and that button's label depend on it, so this reflows the
     * header in place instead of re-rendering the agenda: no scroll jump, no
     * data round-trip.
     */
    function applyHeaderModeMessage(mode: string | undefined): void {
        headerMode = mode ?? 'auto';
        applyHeaderLayout();
        refreshHeaderModeButton();
    }

    /**
     * Repository events arrive on git's schedule, not the agenda's, so this
     * replaces one node instead of re-rendering: a save must not move the task
     * list or the user's scroll position.
     */
    function applyGitStatus(status: AgendaGitStatus | null): void {
        gitStatus = status;
        refreshGitMenu();
    }

    /** Click a directory chip by its root, as `clickCollectionChipForTesting` asks. */
    function clickCollectionChip(root: string): void {
        const chip = document.querySelector<HTMLElement>(
            `.collection-chip[data-root="${root.replaceAll('"', '\\"')}"]`
        );
        chip?.click();
    }

    /** Click one item of a section's group menu, as `clickGroupActionForTesting` asks. */
    function clickGroupAction(section: string, action: string): void {
        const quote = (value: string) => value.replaceAll('"', '\\"');
        const item = document.querySelector<HTMLElement>(
            `.group-menu[data-section="${quote(section)}"] .group-menu-item[data-action="${quote(action)}"]`
        );
        item?.click();
    }

    function handleHostMessage(message: HostMessage): void {
        if (message.command === 'init') {
            applyStatePayload(message, 'init');
            renderFromInit(message);
        } else if (message.command === 'update') {
            applyStatePayload(message, 'update');
            renderFromUpdate(message);
        } else if (message.command === 'headerMode') {
            applyHeaderModeMessage(message.headerMode);
        } else if (message.command === 'gitStatus') {
            applyGitStatus(message.status ?? null);
        } else if (message.command === 'getRenderedInfo') {
            postRenderedInfo();
        } else if (message.command === 'setScrollForTesting') {
            // Integration-test hook: the clipping markers and the sticky-anchor
            // fix only differ from the trivial case at a non-zero scroll
            // position, and nothing outside the page can put it there.
            // Production code never sends this command.
            window.scrollTo(0, message.y ?? 0);
            refreshClipMarkers();
        } else if (message.command === 'clickCollectionChipForTesting') {
            clickCollectionChip(message.root ?? '');
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- spelled out rather than a bare `else`, so the branch says which command it serves
        } else if (message.command === 'clickGroupActionForTesting') {
            clickGroupAction(message.section ?? '', message.action ?? '');
        }
    }

    /**
     * Integration-test query: snapshot the rendered DOM so the host can verify
     * that renderAgenda produced the expected day-headers for the given anchor
     * date. Production code never sends this query, so it has no effect on
     * normal use.
     */
    function postRenderedInfo(): void {
        const headers = [...document.querySelectorAll('.day-header')]
            .map((el) => el.getAttribute('data-date'))
            .filter((d) => d !== null);
        const flags = [...document.querySelectorAll('.flag')].map((el) => el.getAttribute('data-flag'));
        // Section-panel titles in document order (Day and Tasks cards), so a
        // test can assert the grouping and its order.
        const sections = [...document.querySelectorAll('.day-section-name')].map((el) => el.textContent);
        // Which sections offer an action on the whole band: the key each
        // menu carries, which is also what a click on it would post back.
        const sectionMenus = [...document.querySelectorAll('.group-menu')].map((el) => el.getAttribute('data-section'));
        // Collection dots in row order, each reported by the tooltip that
        // names its directory: with one directory scanned there are none,
        // which is the state a test has no other way to tell apart from
        // "the mark was rendered without a name".
        const collectionMarks = [...document.querySelectorAll('.task-line .collection')].map((el) =>
            el.getAttribute('title')
        );
        // The chip row, each chip as its directory name plus the state it is
        // in. The name alone would not tell a chip that is off from one
        // that is on, and that difference is the whole feature.
        const collectionChips = [...document.querySelectorAll('.collection-chip')].map(
            (el) => `${el.textContent}${el.classList.contains('off') ? ' (off)' : ''}`
        );
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
        // The git chip arrives on its own message, after the render; its
        // text is how a test sees that the whole path -- repository
        // resolution, the status message, the markup -- reached the page.
        const gitChip = document.getElementById('gitMenuBtn')?.textContent ?? '';
        const dayNumbers = [...document.querySelectorAll('.calendar-day .day-number')].map((el) => el.textContent);
        // Clipping chips per day header, in the same order as `dayHeaders`.
        // A hidden chip reports 0 rather than its stale text, which is what
        // the page shows the user.
        const clipAbove: number[] = [];
        const clipBelow: number[] = [];
        for (const header of document.querySelectorAll('.day-header[data-date]')) {
            clipAbove.push(readChipCount(header.querySelector<HTMLElement>('.day-clip-above')));
            clipBelow.push(readChipCount(header.querySelector<HTMLElement>('.day-clip-below')));
        }
        vscode.postMessage({
            command: 'renderedInfo',
            dayHeaders: headers,
            heroSub,
            dayNumbers,
            gitChip,
            mode: initialMode,
            flags,
            sections,
            sectionMenus,
            collectionMarks,
            collectionChips,
            clipAbove,
            clipBelow,
            scrollY: window.scrollY,
            // The bug this snapshot was extended for: after a mode switch
            // the day's first row sat behind its own sticky header, which
            // no other field here would show.
            todayFirstRowHidden: measureTodayFirstRowHidden(),
            // The header layout is a class on <body>, so this is how a test
            // sees which of the two the page settled on.
            headerLayout: document.body.classList.contains('compact-header') ? 'compact' : 'full',
            heroSharesControlRow
        });
    }

    // Render the current mode into #content and wire its listeners. Shared by
    // the init and update paths so the two can never drift apart.
    function renderCurrentMode(): void {
        const content = document.getElementById('content');
        if (!content) {
            return;
        }
        // What the chips left on screen. Held in a local rather than written
        // back over `initialData`: the chips are a view of the scan, and a
        // reader turning one back on must get its rows back without another
        // walk of the notes.
        const shown = hideCollections(initialData, hiddenCollections);
        if (initialMode === 'month') {
            content.innerHTML = renderMonth(shown as DayAgenda[]);
            attachCalendarListeners();
            return;
        }
        if (initialMode === 'week') {
            content.innerHTML = renderAgenda(shown as DayAgenda[]);
            wireDayHeaderNavigation(document, initialMode, navigateToDay, UI.openDayView);
            return;
        }
        // An unknown mode renders nothing rather than guessing a view.
        if (initialMode !== 'day' && initialMode !== 'tasks') {
            return;
        }
        content.innerHTML = initialMode === 'day' ? renderDayCard(shown as DayAgenda[]) : renderTasks(shown as Task[]);
    }

    function parseLocalDate(str: string): Date {
        // The page only ever parses dates the extractor emitted, so the three
        // parts are there; zeros keep the reader total instead of asserting it.
        const [y = 0, m = 1, d = 1] = str.split('-').map(Number);
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
        // Same rule for the band menus: a click anywhere else puts them away.
        // Their own handler stops the event before it reaches here, so opening
        // one does not immediately close it.
        document.querySelectorAll('.group-menu.open').forEach(function (m) {
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
                el.addEventListener('click', () => {
                    navigateToDay(date);
                });
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
        // The section-head menu sits inside #content, so it is read first: its
        // mark and its items are not task rows, and letting the row handler see
        // them would open a file the click was never about.
        if (handleGroupMenuClick(e)) {
            return;
        }
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

    /**
     * The band menu: the mark opens it, an item acts on the whole band.
     *
     * Returns whether the click belonged to a menu, so the row handler can stand
     * down. The message carries the band's key rather than its tasks: the
     * extension side holds the payload the view was built from and resolves the
     * band there, so the page never assembles a file list.
     */
    function handleGroupMenuClick(e: Event): boolean {
        const target = e.target as HTMLElement | null;
        const item = target?.closest('.group-menu-item');
        if (item) {
            e.stopPropagation();
            closeGroupMenus();
            const section = item.closest('.group-menu')?.getAttribute('data-section');
            const action = item.getAttribute('data-action');
            if (section && action) {
                // The chips that are off travel with the message. The host
                // rebuilds the band from the payload the view was built from,
                // and that payload is the whole scan -- without this it would
                // reach rows of a directory that is not on this screen.
                vscode.postMessage({
                    command: 'groupAction',
                    section: section,
                    action: action,
                    hidden: [...hiddenCollections]
                });
            }
            return true;
        }
        const button = target?.closest('.group-menu-btn');
        if (!button) {
            return false;
        }
        e.stopPropagation();
        const menu = button.closest('.group-menu');
        document.querySelectorAll('.group-menu').forEach((m) => {
            if (m === menu) {
                m.classList.toggle('open');
            } else {
                m.classList.remove('open');
            }
        });
        return true;
    }

    function closeGroupMenus(): void {
        document.querySelectorAll('.group-menu.open').forEach((m) => {
            m.classList.remove('open');
        });
    }

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
                    // Empty until refreshClipMarkers measures: the counts depend
                    // on the scroll position, which does not exist yet while the
                    // markup is still a string.
                    renderDayClipHtml() +
                    '</div>'
            );
            (day.overdue ?? []).forEach((task) => parts.push(renderTask(task, task.days_offset, 'overdue')));
            (day.scheduled_timed ?? []).forEach((task) => parts.push(renderTask(task, task.days_offset)));
            (day.scheduled_no_time ?? []).forEach((task) => parts.push(renderTask(task, task.days_offset)));
            (day.upcoming ?? []).forEach((task) => parts.push(renderTask(task, task.days_offset, 'upcoming')));
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
        const day: DayAgenda = days[0] ?? {
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
        const sectionsHtml = sections
            .map((sec) => {
                const rows = sec.items
                    .map((it) => {
                        const taskType =
                            it.kind === 'overdue' ? 'overdue' : it.kind === 'upcoming' ? 'upcoming' : undefined;
                        return renderTask(it.task, it.task.days_offset, taskType);
                    })
                    .join('');
                // On `flat` the rows stand on their own: the panel is what
                // carries the heading, the count and the group menu, and the
                // setting asks for a day without them. The order is untouched —
                // the sections still decide it, they just stop announcing
                // themselves.
                if (grouping === 'flat') {
                    return rows;
                }
                // Only the overdue bands offer a group action: what "move the
                // whole section to today" would mean for the tasks already
                // scheduled today is nothing, and for the upcoming ones it is
                // the opposite of what they are.
                const actions = sec.key.startsWith('overdue-') ? renderGroupMenu(sec.key, sec.title) : '';
                return renderSectionPanel(sec.key, sec.title, sec.items.length, rows, actions);
            })
            .join('');
        return renderCard('day', renderSummaryBar(day.date, pieces), sectionsHtml, UI.empty.day, { escapeHtml });
    }

    // ---- shared card chrome (Day and Tasks views) ----
    // Both views stack section panels under a sticky summary bar and render
    // their rows as standard .task-line elements, so the markup lives here once
    // instead of being duplicated per view.

    function summaryStat(n: number, word: string | string[], cls: string): string {
        return summaryStatHtml(n, word, cls, { locale, uiLang, escapeHtml, formatNumber, pluralIndex });
    }

    function renderSummaryBar(dateIso: string, pieces: string[]): string {
        return renderSummaryBarHtml(dateIso, pieces, { escapeHtml });
    }

    function renderSectionPanel(
        key: string,
        title: string,
        count: number,
        rowsHtml: string,
        actionsHtml: string
    ): string {
        return renderSectionPanelHtml(
            key,
            title,
            count,
            rowsHtml,
            {
                locale,
                uiLang,
                inSectionTemplate: UI.countChip.inSection,
                taskForms: UI.countChip.tasks,
                escapeHtml,
                formatString,
                formatNumber,
                pluralIndex
            },
            actionsHtml
        );
    }

    function renderGroupMenu(sectionKey: string, sectionTitle: string): string {
        return renderGroupMenuHtml(sectionKey, sectionTitle, { strings: UI.group, escapeHtml, formatString });
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
        weekFocusHeld = true;
        requestAnimationFrame(applyWeekFocus);
    }

    /** Put today's header under the agenda header, wherever it currently ends. */
    function applyWeekFocus(): void {
        // focusStickyAnchor, not a bare scrollIntoView: today's header is
        // sticky, and one that is already pinned reports its pinned box, so
        // scrollIntoView would consider it in place and leave the page
        // scrolled past the day's first rows. See agendaScroll.ts.
        focusStickyAnchor(window, document.querySelector('.day-header[data-date="' + toIsoDate(new Date()) + '"]'));
        refreshClipMarkers();
    }

    // A real scrolling gesture makes the position the user's own, so the week
    // focus stops following the header. Listening for the gestures rather than
    // for `scroll` is what separates the two: the focus scrolls the page itself,
    // and a `scroll` listener could not tell that apart from a wheel turn.
    for (const gesture of ['wheel', 'touchstart', 'keydown'] as const) {
        window.addEventListener(gesture, () => {
            weekFocusHeld = false;
        });
    }

    // Clipping chips (week view): how many of each day's rows are currently
    // hidden behind the pinned day-header or below the bottom of the panel.
    // Recomputed from live geometry, so it has to run on every scroll frame as
    // well as after a render or a resize. rAF-coalesced: a scroll fires far
    // more often than the page paints, and the measurement is only meaningful
    // once per frame anyway.
    let clipTicking = false;
    function refreshClipMarkers(): void {
        if (initialMode !== 'week' || clipTicking) {
            return;
        }
        clipTicking = true;
        requestAnimationFrame(() => {
            clipTicking = false;
            updateDayClipMarkers(document, window.innerHeight, UI.clip, countClippedRows, formatString, (n) =>
                formatNumber(n, locale)
            );
        });
    }
    window.addEventListener('scroll', refreshClipMarkers, { passive: true });
    window.addEventListener('resize', refreshClipMarkers);

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
        // This card holds tasks of every date at once, so a row states its own
        // date -- a bare 09:30 names no day -- and reads its direction off that
        // date rather than off a bucket. The anchor is the pinned today when
        // one is set (ADR-0015), the real one otherwise.
        const anchor = shiftedToday || toIsoDate(new Date());
        // Group key -> section key: "pa"/"pb"/"pc"/"pnone", which the style sheet
        // tints to match the priority chip colours.
        const groupsHtml = groups
            .map((group) => {
                const rows = group.items
                    .map((task) => renderTask(task, undefined, taskDateDirection(task, anchor), 'always'))
                    .join('');
                return renderSectionPanel(`p${group.key}`, group.title, group.items.length, rows, '');
            })
            .join('');
        return renderCard('tasks', renderSummaryBar('', pieces), groupsHtml, UI.empty.tasks, { escapeHtml });
    }

    function formatDayHeader(date: string): string {
        return renderDayHeaderHtml(formatDayHeaderParts(date, locale));
    }

    // The row markup is in utils/agendaCardHtml.ts; this binds the page's
    // dictionary and the memoised date formatter to it. Called from both cards.
    function renderTask(
        task: TaskWithOffset,
        daysOffset?: number,
        taskType?: string,
        showDate?: 'when-offset' | 'always'
    ): string {
        return renderTaskRow(task, daysOffset, taskType, {
            showDate,
            tooltips: UI.tooltips,
            escapeHtml,
            formatString,
            formatDate: formatDateForTitle,
            sanitizeTaskLine,
            isCancelled,
            resolveTaskFlag,
            resolveAttentionLevel,
            resolveHeadingClass,
            attentionTooltip,
            flagTooltip,
            priorityTooltip,
            collectionMark: (root) =>
                collectionMarkHtml(root, collections, {
                    collectionTooltip: UI.tooltips.collection,
                    escapeHtml,
                    formatString
                })
        });
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

    /**
     * The month grid. Layout (buildMonthGrid) and markup (renderMonthCalendar)
     * are both inlined and unit-tested; this binds the page's live state to
     * them -- the anchor month, the holiday list and the task counts.
     */
    function renderMonth(days: DayAgenda[]): string {
        const todayIso = toIsoDate(new Date());
        const firstOffset = resolveFirstDayOffset(firstDayOfWeek, locale);
        const cells = buildMonthGrid(shiftedToday || todayIso, firstOffset, todayIso);
        return renderMonthCalendar(cells, buildWeekdayLabels(firstOffset, locale), {
            locale,
            uiLang,
            openDayView: UI.openDayView,
            taskChipForms: UI.countChip.tasks,
            overdueChipTemplate: UI.countChip.overdue,
            // date -> { total, overdue }; a missing date means an empty day.
            index: buildMonthDayIndex(days),
            isHoliday,
            escapeHtml,
            formatString,
            formatNumber,
            pluralIndex,
            countLabel: countLabelHtml
        });
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
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- scrollHistory is a dictionary keyed by anchor date; dropping an entry is what it is for
            delete scrollHistory[newDate];
        }
        vscode.postMessage({ command: 'navigate', date: newDate });
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
            btn.textContent = tagButtonText(tag, { tagAll: UI.tagAll, tagButton: UI.tagButton, formatString });
        }
        vscode.postMessage({ command: 'setTag', tag: tag });
    }

    function attachTagMenuListeners(): void {
        const btn = document.getElementById('tagMenuBtn');
        if (btn) {
            btn.addEventListener('click', (ev) => {
                toggleMenu(ev, 'tagMenu');
            });
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

    /** The git chip's markup for the current status, or nothing without git. */
    function renderGitMenuHtml(): string {
        if (!gitStatus) {
            return '';
        }
        return renderGitMenu(gitStatus, {
            git: UI.git,
            locale,
            uiLang,
            escapeHtml,
            formatString,
            formatNumber,
            pluralIndex
        });
    }

    /**
     * Swap the chip in place after a new status arrived.
     *
     * The node is replaced rather than patched because every part of it depends
     * on the counters -- the stats, the groups, which action buttons exist. It
     * is inserted at the end of the control row when it was not there before,
     * which is the case on the first status after a panel opens.
     */
    function refreshGitMenu(): void {
        const existing = document.getElementById('gitMenu');
        const html = renderGitMenuHtml();
        if (!html) {
            existing?.remove();
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const fresh = wrapper.firstElementChild;
        if (!fresh) {
            return;
        }
        if (existing) {
            existing.replaceWith(fresh);
        } else {
            const controlRow = document.querySelector('.control-row');
            if (!controlRow) {
                return;
            }
            controlRow.append(fresh);
        }
        attachGitMenuListeners();
    }

    function attachGitMenuListeners(): void {
        document.getElementById('gitMenuBtn')?.addEventListener('click', (ev) => {
            toggleMenu(ev, 'gitMenu');
        });
        document.querySelectorAll('#gitMenu .git-file').forEach((el) => {
            el.addEventListener('click', () => {
                const file = el.getAttribute('data-file');
                if (file) {
                    vscode.postMessage({ command: 'openSourceFile', file: file });
                }
            });
        });
        // Both actions raise host UI (an input box, a modal) and the dropdown
        // would otherwise stay open behind it; the click that reaches document
        // closes it, so nothing extra is needed here beyond sending the intent.
        document.getElementById('gitCommitBtn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'gitCommit' });
        });
        document.getElementById('gitPushBtn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'gitPush' });
        });
    }

    function renderHeaderModeButton(): string {
        return renderHeaderModeButtonHtml(headerMode, {
            headerModeButton: UI.headerModeButton,
            headerModeTitle: UI.headerModeTitle,
            headerModes: UI.headerModes,
            escapeHtml,
            formatString,
            nextHeaderMode
        });
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
        // The header-layout button and the Tag picker sit at the right edge of
        // the control row.
        const chipsHtml =
            renderHeaderModeButton() +
            renderTagMenu(availableTags, currentTag, {
                tagAll: UI.tagAll,
                tagAllTitle: UI.tagAllTitle,
                tagButton: UI.tagButton,
                tagCaption: UI.tagCaption,
                tagFilterTitle: UI.tagFilterTitle,
                escapeHtml,
                formatString
            }) +
            // Re-rendered with the rest of the header so a nav-bar rebuild does
            // not drop a status that already arrived; `refreshGitMenu` then
            // handles the updates that come between rebuilds.
            renderGitMenuHtml();
        // resolveHeroModel (inlined, unit-tested) decides the title shape and
        // whether the TODAY badge shows; Intl formatting of the actual text stays
        // here where the locale lives.
        const hero = resolveHeroModel(initialMode, shiftedToday, toIsoDate(new Date()));
        const badge = hero.showToday ? UI.todayBadge : '';

        // Date navigation (Prev/Today/Next) exists for every mode except Tasks.
        let dateNavHtml = '';
        if (hero.kind === 'tasks') {
            heroEl.innerHTML = renderHeroHtml({ title: UI.modes.tasks }, { escapeHtml });
        } else {
            const d = parseLocalDate(shiftedToday);
            const year = formatNumber(d.getFullYear(), locale);
            heroEl.innerHTML =
                hero.kind === 'month'
                    ? renderHeroHtml(
                          { title: d.toLocaleDateString(locale, { month: 'long' }), sub: year, badge },
                          { escapeHtml }
                      )
                    : renderHeroHtml(
                          {
                              title: d.toLocaleDateString(locale, { weekday: 'long' }),
                              sub: `${d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })} ${year}`,
                              badge
                          },
                          { escapeHtml }
                      );

            const unit = initialMode === 'day' ? 'day' : initialMode === 'week' ? 'week' : 'month';
            dateNavHtml = renderDateNav(unit, {
                navPrev: UI.navPrev,
                navNext: UI.navNext,
                navToday: UI.navToday,
                navTodayTitle: UI.navTodayTitle,
                escapeHtml
            });
        }

        navBar.innerHTML = renderNavBarHtml({
            modeSwitch: renderModeSwitch(initialMode, {
                modes: UI.modes,
                switchToView: UI.switchToView,
                escapeHtml,
                formatString
            }),
            dateNav: dateNavHtml,
            chips: chipsHtml
        });

        if (hero.kind !== 'tasks') {
            document.getElementById('btn-prev')?.addEventListener('click', () => {
                navigate(-1);
            });
            document.getElementById('btn-today')?.addEventListener('click', () => {
                navigate(0);
            });
            document.getElementById('btn-next')?.addEventListener('click', () => {
                navigate(1);
            });
        }
        document.getElementById('headerModeBtn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'cycleHeaderMode' });
        });

        attachModeSwitchListeners();
        attachTagMenuListeners();
        attachGitMenuListeners();
        renderCollectionRow();
    }

    /**
     * The row of collection chips under the header, and its listeners.
     *
     * Its own element rather than part of the nav bar: the nav bar is one line
     * of controls that the compact layout squeezes, and a directory name is
     * text of unknown length. Rebuilt with the header, so a scan that brought a
     * new directory in is followed by a chip for it.
     */
    function renderCollectionRow(): void {
        const row = document.getElementById('collection-row');
        if (!row) {
            return;
        }
        row.innerHTML = renderCollectionChips(collections, hiddenCollections, {
            chipTitle: UI.collectionChipTitle,
            escapeHtml,
            formatString
        });
        row.querySelectorAll('.collection-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const root = chip.getAttribute('data-root');
                if (root === null) {
                    return;
                }
                hiddenCollections = hiddenCollections.includes(root)
                    ? hiddenCollections.filter((entry) => entry !== root)
                    : [...hiddenCollections, root];
                // The chips themselves are redrawn too: the one just pressed
                // has to show which side of the filter it is on now.
                renderCollectionRow();
                renderCurrentMode();
            });
        });
    }
}
