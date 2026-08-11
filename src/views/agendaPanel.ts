import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { AgendaData } from '../types';
import { isMeaningfulSelection, resolveTaskClickIntent, sanitizeTaskLine } from '../utils/agendaClick';
import { escapeHtml } from '../utils/agendaEscapeHtml';
import { DEFAULT_AGENDA_FONT_STACK, sanitizeFontFamily } from '../utils/agendaFontFamily';
import { agendaModeCommand } from '../utils/agendaModeCommand';
import { rememberScroll, recallScroll, focusStickyAnchor } from '../utils/agendaScroll';
import { countClippedRows, renderDayClipHtml, updateDayClipMarkers } from '../utils/agendaClipMarkers';
import { resolveHeadingClass } from '../utils/agendaHeadingTint';
import { resolveTaskFlag } from '../utils/agendaTaskFlag';
import { resolveAttentionLevel } from '../utils/agendaAttention';
import { resolveAgendaDirectories } from '../utils/agendaDirectories';
import { isIsoDate, toIsoDate } from '../utils/isoDate';
import { resolveDayRolloverAnchor } from '../utils/dayRolloverAnchor';
import { formatNumber } from '../utils/formatNumber';
import { formatIsoDate } from '../utils/formatIsoDate';
import { explicitSettingValue } from '../utils/explicitSetting';
import { resolveDateLocale } from '../utils/dateLocale';
import { formatDayHeaderParts } from '../utils/agendaDayHeader';
import {
    countLabel,
    renderDayHeaderHtml,
    renderSectionPanel,
    renderSummaryBar,
    summaryStat
} from '../utils/agendaSummaryHtml';
import { renderGroupMenu } from '../utils/agendaGroupMenuHtml';
import { asBulkAction, groupTargets } from '../utils/agendaGroupTargets';
import { applyGroupAction } from '../commands/groupActions';
import {
    renderDateNav,
    renderHeaderModeButton,
    renderHeroHtml,
    renderModeSwitch,
    renderNavBarHtml,
    renderTagMenu,
    tagButtonText,
    tagLabel
} from '../utils/agendaNavHtml';
import {
    buildWeekdayLabels,
    calendarCellOpenTag,
    renderMonthCalendar,
    resolveFirstDayOffset
} from '../utils/agendaCalendarHtml';
import { renderCard, renderTaskRow } from '../utils/agendaCardHtml';
import { taskDateDirection } from '../utils/agendaDateDirection';
import {
    gitActions,
    gitChipStats,
    gitChipTitle,
    gitCount,
    gitFileRows,
    gitFilesByRepository,
    gitGroup,
    gitGroups,
    gitUnpushedGroupTitle,
    renderGitChip,
    renderGitMenu
} from '../utils/agendaGitHtml';
import { agendaSourceFiles, agendaSourceRoots } from '../utils/git/agendaSourceFiles';
import { buildCollectionMarks, collectionMarkHtml } from '../utils/agendaCollections';
import { hideCollections, renderCollectionChips } from '../utils/agendaCollectionFilter';
import { collectGitStatus, gitApiForEvents } from '../utils/git/collectGitStatus';
import { forgetResolvedRepositories } from '../utils/git/gitApi';
import { commitAgendaSources, pushAgendaSources } from '../commands/gitActions';
import { isCancelled } from '../utils/normalizeTaskType';
import { shiftMonthAnchor } from '../utils/monthNav';
import { wireDayHeaderNavigation } from '../utils/agendaDayHeaderNav';
import { attentionTooltip, flagTooltip, priorityTooltip } from '../utils/agendaTooltips';
import { buildTagCycle } from '../utils/cycleTag';
import { resolveHeroModel } from '../utils/agendaHero';
import { computeDaySummary, buildDaySections } from '../utils/agendaDaySummary';
import { buildTaskGroups, computeTasksSummary } from '../utils/agendaTaskGroups';
import { buildMonthDayIndex, buildMonthGrid } from '../utils/agendaMonthCells';
import type { AgendaHeaderMode } from '../utils/agendaHeaderMode';
import { nextHeaderMode, normalizeHeaderMode, resolveHeaderLayout } from '../utils/agendaHeaderMode';
import type { AgendaStrings, UiLanguage } from '../utils/agendaI18n';
import { AGENDA_STRINGS, formatString, pluralIndex, resolveUiLanguage } from '../utils/agendaI18n';
import type { AgendaViewState } from '../utils/agendaHistory';
import { AgendaHistory } from '../utils/agendaHistory';
import type { AgendaClientBootstrap, AgendaClientDeps } from '../webview/agendaClient';
import { agendaClientMain } from '../webview/agendaClient';
import { formatError, notifyError, notifyWarn } from '../utils/notify';
import { logDiagnostic } from '../utils/logChannel';
import { AGENDA_STYLES } from './agendaStyles';

const REFRESH_DEBOUNCE_MS = 500;
/**
 * How long repository events are collected before the status is recomputed.
 * A single `git commit` moves several of the Git extension's resource groups
 * and fires an event per move; 300 ms is short enough to read as immediate and
 * long enough that one user action costs one recomputation.
 */
const GIT_STATUS_DEBOUNCE_MS = 300;
// Window of time after createWebviewPanel within which the webview is expected
// to send back its `ready` handshake. VS Code's webview host registers a
// ServiceWorker on first use, and on a freshly opened window that registration
// occasionally races against the very first Show Agenda command, producing
// "InvalidStateError: Failed to register a ServiceWorker". After the ServiceWorker
// is up, recreating the panel succeeds, so we wait, then dispose+recreate.
const WEBVIEW_READY_TIMEOUT_MS = 2000;
const WEBVIEW_MAX_RETRIES = 2;
type FirstDayOfWeek = 'monday' | 'sunday' | 'auto';

function msUntilNextLocalMidnight(now: Date): number {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return next.getTime() - now.getTime();
}

function generateNonce(): string {
    return randomBytes(16).toString('base64');
}

/**
 * What the page can post back. The webview API hands the payload over as
 * `any`, so this is the shape the handler narrows it to; each field is
 * validated there before it is used.
 */
interface AgendaWebviewMessage {
    command: string;
    file?: string;
    line?: number;
    switchToDay?: boolean;
    date?: string;
    mode?: string;
    tag?: string;
    /** `groupAction`: the day-card section key, and what to do to its tasks. */
    section?: string;
    action?: string;
    /**
     * `groupAction`: the roots whose chips are off. The state lives in the page
     * (turning one back on must not cost a scan), so the band the host rebuilds
     * is narrowed by what the page reports here.
     */
    hidden?: unknown;
    /** Set on `renderError`: what the page failed at. */
    message?: string;
}

/** Everything an `init` message needs, so a panel can be (re)populated from it. */
interface AgendaRenderArgs {
    data: AgendaData;
    mode: string;
    locale: string;
    currentTag: string | undefined;
    availableTags: string[];
    holidays: string[] | undefined;
    firstDayOfWeek: FirstDayOfWeek;
    headerMode: AgendaHeaderMode;
}

/**
 * What a caller supplies to {@link AgendaPanel.render}; everything else in
 * {@link AgendaRenderArgs} is read from the settings on each render.
 *
 * A named object rather than a positional list: the tail of the list is five
 * optional values of which three are booleans and two are strings, so a call
 * site said `render(data, mode, date, cb, true, undefined, [], false)` and only
 * the signature told the reader which `true` was which.
 */
export interface AgendaRenderRequest {
    data: AgendaData;
    mode: string;
    shiftedToday?: string;
    refreshCallback?: (shiftedToday?: string, userInitiated?: boolean) => Promise<void>;
    userInitiated?: boolean;
    currentTag?: string;
    /**
     * Names of the merged tag dictionary, in the order the dropdown lists them.
     *
     * Passed in rather than read here: the dictionary reaches beyond the
     * settings into a file per notes directory, and reading those is async
     * while a render is not. The caller has just built it to filter the data,
     * so the list and the tasks on screen describe the same dictionary.
     */
    tagNames?: readonly string[];
    holidays?: string[];
    /**
     * True when this render came from an explicit jump (Prev/Next/Today button
     * or switch-mode), false for the initial open or a repeated Show Agenda
     * command. The webview uses this to decide whether to scroll to today
     * (jump) or keep the user's scroll (repeat).
     */
    navigation?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- one panel exists at a time, so its state is static by design; a namespace cannot hold the private statics this keeps
export class AgendaPanel {
    private static currentPanel?: vscode.WebviewPanel | undefined;
    // One watcher per scanned directory (`markdown-org.workspaceDirs` may name
    // several); empty while no panel has asked for one.
    private static watchers: vscode.FileSystemWatcher[] = [];
    private static debounceTimer?: NodeJS.Timeout | undefined;
    private static refreshCallback?: ((shiftedToday?: string, userInitiated?: boolean) => Promise<void>) | undefined;
    // The "anchor" date the panel is currently built around: today + any
    // Prev/Next offset the user has applied. Equals today on first open and
    // after the Today button; offset elsewhere. Drives the extractor query,
    // the navbar label, and which date the navigation buttons step from.
    private static shiftedToday?: string | undefined;
    // Browser-style navigation history of {mode, date} view states. record()
    // is called on every render; goBack/goForward replay a past state. Cleared
    // on dispose so a reopened panel starts fresh.
    private static history = new AgendaHistory();
    // How many history replays are in flight. Non-zero means the re-render they
    // cause must not be recorded again (which would push a duplicate or, for a
    // tasks replay whose date the view normalises, fork the stack).
    //
    // A counter rather than a flag because replays can overlap: VS Code does
    // not serialise webview messages or command invocations, so two quick
    // Back presses start two replays, and with a flag the first one to finish
    // cleared it while the second was still running. That second render was
    // then recorded, and recording drops the forward tail -- Forward silently
    // stopped working.
    private static historyReplayDepth = 0;
    private static dayCheckTimer?: NodeJS.Timeout | undefined;
    // Watches the settings that are baked into the webview HTML (as opposed to
    // those delivered by an update message). Lives as long as the panel.
    private static configListener?: vscode.Disposable | undefined;
    // Tracks the ServiceWorker readiness handshake from the webview. The
    // webview sends `{command: 'ready'}` once acquireVsCodeApi() succeeds; if
    // it never arrives within WEBVIEW_READY_TIMEOUT_MS, we assume the host
    // failed to register its ServiceWorker and retry by recreating the panel.
    private static readyTimeout?: NodeJS.Timeout | undefined;
    private static panelReady = false;
    private static createRetries = 0;
    private static internalRetryInProgress = false;
    private static lastCreateArgs?: AgendaRenderArgs | undefined;
    // What the panel currently shows. Unlike `lastCreateArgs` -- which is a
    // snapshot for the ServiceWorker-race retry and is dropped as soon as the
    // webview reports ready -- this one lives as long as the panel and tracks
    // every update, so the shell can be rebuilt and repopulated at any time.
    private static lastRenderArgs?: AgendaRenderArgs | undefined;
    // A header mode the page did not receive (postMessage resolved false),
    // re-sent once the page reports ready again.
    private static pendingHeaderMode?: AgendaHeaderMode | undefined;
    // Last `dateLocale` value that was rejected, so the warning about it is
    // shown once rather than on every refresh.
    private static warnedLocale?: string | undefined;
    // Subscriptions to the Git extension: one per open repository plus the two
    // that track repositories appearing and disappearing. Rebuilt whenever the
    // set of repositories changes, disposed with the panel.
    private static gitListeners: vscode.Disposable[] = [];
    private static gitDebounceTimer?: NodeJS.Timeout | undefined;
    // Monotonic id of the in-flight status computation. A recomputation is
    // async (it may spawn `git diff`), so a later one can finish first; the
    // result of anything but the newest request is dropped rather than
    // overwriting fresher numbers with older ones.
    private static gitRequestSeq = 0;
    // Whether a render failure inside the webview has already been reported for
    // the open panel. A broken payload fails on every refresh, and the
    // file-watcher refreshes on each save, so the report is once per panel.
    private static reportedRenderError = false;
    // Test-only hooks for exercising the ServiceWorker-race retry path:
    // `_testReadyTimeoutMs` shortens the wait so a single integration test
    // runs in milliseconds instead of seconds; `_testSuppressReadies` counts
    // the next N `ready` messages that handleReady should silently drop, so
    // the timeout actually fires. Production code keeps the constants intact.
    private static _testReadyTimeoutMs?: number | undefined;
    private static _testSuppressReadies = 0;
    // Public read-only counter test code asserts against to verify whether
    // the retry path fired (each createNewPanel call bumps it by one).
    private static _createCount = 0;
    public static __testGetCreateCount(): number {
        return AgendaPanel._createCount;
    }
    public static __testSetReadyTimeoutMs(ms: number | undefined): void {
        AgendaPanel._testReadyTimeoutMs = ms;
    }
    public static __testSuppressNextReadies(n: number): void {
        AgendaPanel._testSuppressReadies = n;
    }

    private static setAgendaFocusedContext(focused: boolean) {
        vscode.commands.executeCommand('setContext', 'markdown-org.agendaFocused', focused);
    }

    /**
     * Reload the agenda through the callback the command wired up, reporting a
     * failure rather than leaving a rejected promise behind.
     *
     * The callers are a midnight timer, the file watcher and webview messages.
     * None of them runs inside a command's error-reporting wrapper, so a
     * rejection here would surface nowhere at all.
     */
    private static requestRefresh(shiftedToday?: string, userInitiated?: boolean): void {
        AgendaPanel.refreshCallback?.(shiftedToday, userInitiated).catch((err: unknown) =>
            notifyError(`agenda refresh failed: ${formatError(err)}`)
        );
    }

    private static scheduleNextDayCheck() {
        // The date this timer is armed on -- "yesterday" by the time it fires.
        // resolveDayRolloverAnchor compares the panel's anchor against it to
        // tell a panel left on today from one the user navigated elsewhere.
        const armedOn = toIsoDate(new Date());
        AgendaPanel.dayCheckTimer = setTimeout(() => {
            const anchor = resolveDayRolloverAnchor(AgendaPanel.shiftedToday, armedOn, toIsoDate(new Date()));
            AgendaPanel.requestRefresh(anchor, false);
            if (AgendaPanel.currentPanel) {
                AgendaPanel.scheduleNextDayCheck();
            }
        }, msUntilNextLocalMidnight(new Date()));
    }

    public static render(request: AgendaRenderRequest) {
        const { data, mode, shiftedToday, refreshCallback, currentTag, holidays } = request;
        const userInitiated = request.userInitiated ?? true;
        const navigation = request.navigation ?? false;
        if (refreshCallback) {
            AgendaPanel.refreshCallback = refreshCallback;
        }
        // An empty anchor means "today", same as an absent one.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        AgendaPanel.shiftedToday = shiftedToday || toIsoDate(new Date());
        // Record this view state in the navigation history, unless we are
        // replaying an existing entry (Back/Forward) -- see historyReplayDepth.
        if (AgendaPanel.historyReplayDepth === 0) {
            AgendaPanel.history.record({ mode, date: AgendaPanel.shiftedToday });
        }
        const config = vscode.workspace.getConfiguration('markdown-org');
        const args: AgendaRenderArgs = {
            data,
            mode,
            locale: AgendaPanel.resolveLocaleSetting(config.get<string>('dateLocale')),
            currentTag,
            // The tag dropdown lists the same rotation cycleTag walks: the
            // implicit "ALL" plus the names of the dictionary (dedup-safe).
            // Recomputed on every render so an edited setting or a tags file
            // arriving with a sync is reflected without reopening.
            availableTags: buildTagCycle(request.tagNames ?? []),
            holidays,
            firstDayOfWeek: config.get<FirstDayOfWeek>('firstDayOfWeek', 'monday'),
            headerMode: normalizeHeaderMode(config.get<string>('agendaHeaderMode'))
        };

        if (AgendaPanel.currentPanel) {
            AgendaPanel.updateExistingPanel(AgendaPanel.currentPanel, args, {
                shiftedToday,
                userInitiated,
                navigation
            });
        } else {
            AgendaPanel.createNewPanel(args);
        }

        if (AgendaPanel.watchers.length === 0 && refreshCallback) {
            AgendaPanel.ensureWatcher(config);
        }

        // Every render can change which files the view is built from, so the
        // status is recomputed per render as well as on repository events.
        AgendaPanel.requestGitStatus();

        if (!AgendaPanel.dayCheckTimer && refreshCallback) {
            AgendaPanel.scheduleNextDayCheck();
        }
    }

    /**
     * The date locale to render with, warning once per bad value.
     *
     * `markdown-org.dateLocale` is a free-form string, and an invalid tag is not
     * a soft failure -- `Intl` throws on it. Checking here, before the value
     * reaches the webview, keeps a typo from emptying the panel; the warning is
     * shown once per distinct value so a refresh loop cannot spam it.
     */
    private static resolveLocaleSetting(configured: string | undefined): string {
        const { locale, rejected } = resolveDateLocale(configured);
        if (rejected && rejected !== AgendaPanel.warnedLocale) {
            AgendaPanel.warnedLocale = rejected;
            notifyWarn(`markdown-org.dateLocale "${rejected}" is not a valid locale; using ${locale}`);
        }
        return locale;
    }

    /**
     * The UI language and its dictionary for the current settings. Read fresh
     * on every render so a `markdown-org.uiLanguage` (or `dateLocale`) change
     * reaches the panel on the next Show Agenda, without reopening it.
     */
    private static uiStrings(): { language: UiLanguage; strings: AgendaStrings } {
        const config = vscode.workspace.getConfiguration('markdown-org');
        // `inspect`, not `get`: the date locale only gets a vote here when the
        // user actually chose one. `get` would fold in the `en-US` default and
        // make the first step always match, leaving the editor-language step
        // unreachable -- a Russian VS Code with untouched settings then showed
        // an English agenda, contradicting what `uiLanguage: auto` promises.
        const explicitLocale = explicitSettingValue(config.inspect<string>('dateLocale')) ?? '';
        const language = resolveUiLanguage(
            config.get<string>('uiLanguage', 'auto'),
            explicitLocale,
            vscode.env.language
        );
        return { language, strings: AGENDA_STRINGS[language] };
    }

    /**
     * Proportional font stack for the agenda, from `markdown-org.agendaFontFamily`
     * with the built-in default for an empty or rejected value.
     */
    private static agendaFontStack(): string {
        const config = vscode.workspace.getConfiguration('markdown-org');
        return sanitizeFontFamily(config.get<string>('agendaFontFamily')) || DEFAULT_AGENDA_FONT_STACK;
    }

    /** Localized tab title, e.g. `Agenda: Week` / `Агенда: Неделя`. */
    private static panelTitleFor(mode: string, strings: AgendaStrings): string {
        const label = mode in strings.modes ? strings.modes[mode as keyof AgendaStrings['modes']] : mode;
        return formatString(strings.tabTitle, label);
    }

    private static updateExistingPanel(
        panel: vscode.WebviewPanel,
        args: AgendaRenderArgs,
        view: { shiftedToday: string | undefined; userInitiated: boolean; navigation: boolean }
    ) {
        if (view.userInitiated) {
            panel.reveal(vscode.ViewColumn.One);
        }
        // Keep the render snapshot in step with what the panel shows, so a
        // shell rebuild replays the current payload rather than the one the
        // panel was opened with. `holidays` is not part of an update message,
        // so the value captured at creation is carried over.
        if (AgendaPanel.lastRenderArgs) {
            AgendaPanel.lastRenderArgs = {
                ...args,
                holidays: AgendaPanel.lastRenderArgs.holidays
            };
        }
        const { language, strings } = AgendaPanel.uiStrings();
        panel.title = AgendaPanel.panelTitleFor(args.mode, strings);
        panel.webview.postMessage({
            command: 'update',
            data: args.data,
            mode: args.mode,
            shiftedToday: view.shiftedToday,
            currentTag: args.currentTag,
            availableTags: args.availableTags,
            // Derived from the payload rather than from the setting: what a row
            // carries is the root the extractor reported, and a directory that
            // contributed no task is nothing the page can mark.
            collections: buildCollectionMarks(agendaSourceRoots(args.data)),
            firstDayOfWeek: args.firstDayOfWeek,
            headerMode: args.headerMode,
            userInitiated: view.userInitiated,
            navigation: view.navigation,
            // Re-sent on every update so a language change takes effect on the
            // next render instead of requiring the panel to be reopened. The
            // date locale rides along for the same reason: it is what most
            // language changes actually come from (`uiLanguage: auto` follows
            // it), so leaving it behind produced a half-translated panel --
            // Russian section titles above English day headers.
            locale: args.locale,
            language,
            strings
        });
    }

    private static createNewPanel(args: AgendaRenderArgs) {
        // Captured for the ServiceWorker-race retry path: if the webview never
        // reaches `ready`, the timeout below disposes the panel and re-enters
        // createNewPanel with these same arguments.
        AgendaPanel.lastCreateArgs = args;
        AgendaPanel.lastRenderArgs = args;
        AgendaPanel.panelReady = false;
        AgendaPanel.reportedRenderError = false;
        AgendaPanel._createCount += 1;
        if (AgendaPanel.readyTimeout) {
            clearTimeout(AgendaPanel.readyTimeout);
            AgendaPanel.readyTimeout = undefined;
        }

        const { language: uiLanguage, strings: uiStrings } = AgendaPanel.uiStrings();

        AgendaPanel.currentPanel = vscode.window.createWebviewPanel(
            'markdownOrgAgenda',
            AgendaPanel.panelTitleFor(args.mode, uiStrings),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        // Drives the `markdown-org.agendaFocused` when-clause so show/cycle
        // keybindings (Ctrl+K Ctrl+K Ctrl+W, Ctrl+K Ctrl+K Ctrl+M, cycleTag) keep working
        // when the user is inside the agenda webview and no markdown editor
        // is focused.
        AgendaPanel.setAgendaFocusedContext(true);

        AgendaPanel.currentPanel.onDidChangeViewState((e) => {
            AgendaPanel.setAgendaFocusedContext(e.webviewPanel.active);
        });

        AgendaPanel.currentPanel.onDidDispose(() => {
            AgendaPanel.handleDispose();
        });
        // The handler is async, so its promise is caught here rather than left
        // to become an unhandled rejection: the commands it dispatches carry
        // their own error reporting today, but that is an invariant of theirs,
        // not of this call site.
        // The webview API types the payload as `any`; it is narrowed here to the
        // shape the handler declares, and every field it reads is validated
        // there before use.
        AgendaPanel.currentPanel.webview.onDidReceiveMessage((message: unknown) =>
            AgendaPanel.handleWebviewMessage(message as AgendaWebviewMessage).catch((err: unknown) =>
                notifyError(`agenda action failed: ${formatError(err)}`)
            )
        );

        // The font stack is baked into the webview's <style> block, so unlike
        // the language and the dictionary it cannot ride along on an update
        // message -- the shell has to be rebuilt. Disposed together with the
        // panel in handleDispose.
        AgendaPanel.configListener?.dispose();
        AgendaPanel.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('markdown-org.agendaFontFamily')) {
                AgendaPanel.rebuildWebviewShell();
            }
            if (event.affectsConfiguration('markdown-org.agendaHeaderMode')) {
                AgendaPanel.pushHeaderMode();
            }
        });

        const nonce = generateNonce();
        const cspSource = AgendaPanel.currentPanel.webview.cspSource;
        AgendaPanel.currentPanel.webview.html = AgendaPanel.getHtmlContent(nonce, cspSource);

        AgendaPanel.currentPanel.webview.postMessage(AgendaPanel.buildInitMessage(args, uiLanguage, uiStrings));

        AgendaPanel.armReadyTimeout();
    }

    /**
     * The `init` payload for a snapshot. Shared by the two paths that populate
     * a freshly built page -- opening a panel and rebuilding its shell -- so
     * that a field added to the snapshot cannot reach one of them and not the
     * other.
     */
    private static buildInitMessage(args: AgendaRenderArgs, language: UiLanguage, strings: AgendaStrings) {
        return {
            command: 'init',
            data: args.data,
            mode: args.mode,
            locale: args.locale,
            shiftedToday: AgendaPanel.shiftedToday,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty tag is no tag, which is what ALL means
            currentTag: args.currentTag || 'ALL',
            availableTags: args.availableTags,
            collections: buildCollectionMarks(agendaSourceRoots(args.data)),
            holidays: args.holidays ?? [],
            firstDayOfWeek: args.firstDayOfWeek,
            headerMode: args.headerMode,
            language,
            strings
        };
    }

    private static armReadyTimeout() {
        const ms = AgendaPanel._testReadyTimeoutMs ?? WEBVIEW_READY_TIMEOUT_MS;
        AgendaPanel.readyTimeout = setTimeout(() => {
            AgendaPanel.readyTimeout = undefined;
            if (AgendaPanel.panelReady) {
                return;
            }
            if (AgendaPanel.createRetries >= WEBVIEW_MAX_RETRIES) {
                notifyError(
                    'Agenda webview failed to load (ServiceWorker not registered). Please reload the VS Code window and try again.'
                );
                AgendaPanel.createRetries = 0;
                AgendaPanel.lastCreateArgs = undefined;
                AgendaPanel.currentPanel?.dispose();
                return;
            }
            const args = AgendaPanel.lastCreateArgs;
            if (!args) {
                return;
            }
            AgendaPanel.createRetries += 1;
            AgendaPanel.internalRetryInProgress = true;
            AgendaPanel.currentPanel?.dispose();
            AgendaPanel.createNewPanel(args);
        }, ms);
    }

    private static handleReady() {
        if (AgendaPanel._testSuppressReadies > 0) {
            AgendaPanel._testSuppressReadies -= 1;
            return;
        }
        AgendaPanel.panelReady = true;
        AgendaPanel.createRetries = 0;
        AgendaPanel.lastCreateArgs = undefined;
        AgendaPanel.flushPendingHeaderMode();
        // The first status may well have been computed before the page could
        // receive it (the panel posts `init` and the status independently), so
        // it is recomputed once the page says it is listening.
        AgendaPanel.requestGitStatus();
        if (AgendaPanel.readyTimeout) {
            clearTimeout(AgendaPanel.readyTimeout);
            AgendaPanel.readyTimeout = undefined;
        }
    }

    private static handleDispose() {
        // armReadyTimeout's retry path disposes the broken panel right before
        // recreating it. In that case the watcher, scheduled day check, and
        // shiftedToday belong to the user's session, not to the failed panel,
        // so we keep them; createNewPanel will reuse them transparently.
        if (AgendaPanel.internalRetryInProgress) {
            AgendaPanel.internalRetryInProgress = false;
            AgendaPanel.currentPanel = undefined;
            return;
        }
        AgendaPanel.setAgendaFocusedContext(false);
        AgendaPanel.currentPanel = undefined;
        AgendaPanel.configListener?.dispose();
        AgendaPanel.configListener = undefined;
        AgendaPanel.history.clear();
        AgendaPanel.watchers.forEach((watcher) => {
            watcher.dispose();
        });
        AgendaPanel.watchers = [];
        AgendaPanel.refreshCallback = undefined;
        AgendaPanel.disposeGitListeners();
        if (AgendaPanel.gitDebounceTimer) {
            clearTimeout(AgendaPanel.gitDebounceTimer);
            AgendaPanel.gitDebounceTimer = undefined;
        }
        // Anything still awaiting will find a newer id and drop its result.
        AgendaPanel.gitRequestSeq += 1;
        // The next agenda open must rebuild its anchor date from
        // initialDate/toIsoDate(today). Keeping a stale shiftedToday from a
        // previous session around would leak into AgendaPanel.refresh()
        // (which reads it directly) the moment a fresh refreshCallback is
        // wired up.
        AgendaPanel.shiftedToday = undefined;
        if (AgendaPanel.debounceTimer) {
            clearTimeout(AgendaPanel.debounceTimer);
            AgendaPanel.debounceTimer = undefined;
        }
        if (AgendaPanel.dayCheckTimer) {
            clearTimeout(AgendaPanel.dayCheckTimer);
            AgendaPanel.dayCheckTimer = undefined;
        }
        if (AgendaPanel.readyTimeout) {
            clearTimeout(AgendaPanel.readyTimeout);
            AgendaPanel.readyTimeout = undefined;
        }
        AgendaPanel.panelReady = false;
        AgendaPanel.createRetries = 0;
        AgendaPanel.lastCreateArgs = undefined;
        AgendaPanel.lastRenderArgs = undefined;
        AgendaPanel.pendingHeaderMode = undefined;
        AgendaPanel.reportedRenderError = false;
    }

    /**
     * Rebuild the webview HTML of the open panel and replay the last payload
     * into it. Used for settings that are part of the shell itself (the font
     * stack), which an update message cannot carry.
     */
    private static rebuildWebviewShell() {
        const panel = AgendaPanel.currentPanel;
        const args = AgendaPanel.lastRenderArgs;
        if (!panel || !args) {
            return;
        }
        const { language, strings } = AgendaPanel.uiStrings();
        // Replacing `html` reloads the webview, so the panel goes through the
        // same ready handshake as a fresh one -- and therefore needs the same
        // watchdog. Without it a shell that fails to come back up (the very
        // ServiceWorker race the watchdog exists for) left an empty panel and
        // no message at all. `lastCreateArgs` is what the retry path replays
        // from, and it was cleared by the first `ready`, so it is restored from
        // the render snapshot here.
        AgendaPanel.panelReady = false;
        AgendaPanel.reportedRenderError = false;
        AgendaPanel.lastCreateArgs = args;
        panel.webview.html = AgendaPanel.getHtmlContent(generateNonce(), panel.webview.cspSource);
        panel.webview.postMessage(AgendaPanel.buildInitMessage(args, language, strings));
        AgendaPanel.armReadyTimeout();
    }

    /**
     * Send the current `markdown-org.agendaHeaderMode` to the open panel. Unlike
     * the font stack this is not baked into the shell -- the page keeps the mode
     * in a variable and only toggles a class on <body> -- so the change needs
     * neither a rebuild nor a re-render. The render snapshot is updated too, so
     * a later shell rebuild replays the new mode.
     */
    private static pushHeaderMode() {
        const panel = AgendaPanel.currentPanel;
        if (!panel) {
            return;
        }
        const config = vscode.workspace.getConfiguration('markdown-org');
        const headerMode = normalizeHeaderMode(config.get<string>('agendaHeaderMode'));
        if (AgendaPanel.lastRenderArgs) {
            AgendaPanel.lastRenderArgs = { ...AgendaPanel.lastRenderArgs, headerMode };
        }
        if (AgendaPanel.lastCreateArgs) {
            AgendaPanel.lastCreateArgs = { ...AgendaPanel.lastCreateArgs, headerMode };
        }
        // `postMessage` resolves to false when the message was not delivered --
        // the page is reloading after an `html` swap, say, which is a real race
        // because the font stack and the header mode arrive from the same
        // configuration listener. Dropping that result silently left the panel
        // on the old layout with nothing to show for it, so the mode is queued
        // and re-sent on the next `ready`.
        void Promise.resolve(panel.webview.postMessage({ command: 'headerMode', headerMode })).then((delivered) => {
            if (!delivered) {
                AgendaPanel.pendingHeaderMode = headerMode;
                logDiagnostic(`agenda headerMode "${headerMode}" not delivered; queued for the next page load`);
            }
        });
    }

    /**
     * Recompute the git status of the view's source files and push it to the
     * page, coalescing bursts of repository events.
     *
     * Debounced rather than run per event: a single commit moves several of the
     * Git extension's resource groups and fires an event for each, and each
     * recomputation can spawn a `git diff`.
     */
    private static requestGitStatus(): void {
        if (AgendaPanel.gitDebounceTimer) {
            clearTimeout(AgendaPanel.gitDebounceTimer);
        }
        AgendaPanel.gitDebounceTimer = setTimeout(() => {
            AgendaPanel.gitDebounceTimer = undefined;
            void AgendaPanel.pushGitStatus();
            void AgendaPanel.ensureGitWatch();
        }, GIT_STATUS_DEBOUNCE_MS);
    }

    /**
     * Compute the status and send it to the page as its own message.
     *
     * A separate message, not part of `update`: the status arrives on git's
     * schedule rather than the agenda's, and folding it into a full update
     * would re-render the task list (and its scroll position) every time a
     * file is saved.
     */
    private static async pushGitStatus(): Promise<void> {
        const panel = AgendaPanel.currentPanel;
        const args = AgendaPanel.lastRenderArgs;
        if (!panel || !args) {
            return;
        }
        const seq = ++AgendaPanel.gitRequestSeq;
        try {
            const status = await collectGitStatus(agendaSourceFiles(args.data));
            // A newer request started while this one was awaiting: its answer
            // is the current one, so this result is stale by definition.
            if (seq !== AgendaPanel.gitRequestSeq || AgendaPanel.currentPanel !== panel) {
                return;
            }
            // `status` is undefined when there is no git at all; the page then
            // removes the chip rather than showing an empty one.
            void panel.webview.postMessage({ command: 'gitStatus', status: status ?? null });
        } catch (error) {
            // Nothing here is worth a toast: the agenda itself rendered fine and
            // the only casualty is a header chip.
            logDiagnostic(`agenda git status failed: ${formatError(error)}`);
        }
    }

    /**
     * Keep one listener per open repository, plus the two that fire when the
     * set of repositories changes.
     *
     * Rebuilt wholesale on each call because a repository can be opened by the
     * resolution chain itself (a symlinked source file outside the workspace
     * folders), which means the set is not known until after a status pass.
     */
    private static async ensureGitWatch(): Promise<void> {
        const api = await gitApiForEvents();
        if (!api || !AgendaPanel.currentPanel) {
            return;
        }
        AgendaPanel.disposeGitListeners();
        const onChange = (): void => {
            AgendaPanel.requestGitStatus();
        };
        // The set of repositories just changed, so which repository holds a
        // given directory can have changed with it: the remembered answers go,
        // and the next pass resolves them again.
        const onRepositorySetChange = (): void => {
            forgetResolvedRepositories();
            onChange();
        };
        AgendaPanel.gitListeners.push(
            api.onDidOpenRepository(onRepositorySetChange),
            api.onDidCloseRepository(onRepositorySetChange)
        );
        for (const repository of api.repositories) {
            AgendaPanel.gitListeners.push(repository.state.onDidChange(onChange));
        }
    }

    private static disposeGitListeners(): void {
        for (const listener of AgendaPanel.gitListeners) {
            listener.dispose();
        }
        AgendaPanel.gitListeners = [];
    }

    /** Re-send a header mode the page never received (see {@link pushHeaderMode}). */
    private static flushPendingHeaderMode() {
        const headerMode = AgendaPanel.pendingHeaderMode;
        const panel = AgendaPanel.currentPanel;
        if (!headerMode || !panel) {
            return;
        }
        AgendaPanel.pendingHeaderMode = undefined;
        void panel.webview.postMessage({ command: 'headerMode', headerMode });
    }

    private static async handleWebviewMessage(message: AgendaWebviewMessage) {
        if (message.command === 'ready') {
            AgendaPanel.handleReady();
            return;
        }
        if (message.command === 'renderError') {
            // The webview caught something the page could not recover from.
            // Without this the failure showed as an empty panel: the ready
            // handshake has already fired by then (it reports that the script
            // started, not that it rendered), so the retry watchdog treats the
            // panel as healthy.
            //
            // The toast is once per panel -- a bad payload fails again on every
            // file-watcher refresh -- but the reason always goes to the log, so
            // a second, different failure in the same panel is still readable
            // afterwards instead of being dropped on the floor.
            const reason = message.message ?? 'unknown error';
            logDiagnostic(`agenda failed to render: ${reason}`);
            if (!AgendaPanel.reportedRenderError) {
                AgendaPanel.reportedRenderError = true;
                notifyError(`agenda failed to render: ${reason}`);
            }
            return;
        }
        if (message.command === 'pageWarning') {
            // Something the page's global listeners caught that is not a failed
            // render: a rejected background promise, a script error outside the
            // message handler. Logged, never toasted -- and, crucially, it does
            // not consume the one toast a real render failure gets.
            logDiagnostic(`agenda page: ${message.message ?? 'unknown error'}`);
            return;
        }
        if (message.command === 'openTask') {
            if (typeof message.file !== 'string' || typeof message.line !== 'number') {
                return;
            }
            // The path is deliberately not restricted to the workspace: the
            // agenda sweeps `markdown-org.workspaceDir`, which may sit outside
            // any workspace folder, and opening such a file is a supported case
            // (covered by an integration test). What made the path worth
            // distrusting was attribute injection through `data-file`, and that
            // is closed by escaping quotes -- see agendaEscapeHtml.ts.
            await AgendaPanel.openTaskInEditor(message.file, message.line);
        } else if (message.command === 'navigate') {
            // The anchor ends up in the extractor's `--date` argument, so it is
            // checked against the one shape the CLI accepts instead of being
            // forwarded verbatim. Both webview senders always supply a date.
            if (!isIsoDate(message.date)) {
                return;
            }
            if (message.switchToDay) {
                // Week-view day-header drill-down into Day view. Reuse the open
                // panel (showAgendaDay renders into it via an update message)
                // instead of dispose+recreate: tearing the webview down and
                // building a fresh one flashes an empty panel mid-switch. This
                // mirrors the smooth segment mode-switch (switchMode below),
                // which also reuses the panel.
                await vscode.commands.executeCommand('markdown-org.showAgendaDay', message.date);
            } else {
                AgendaPanel.requestRefresh(message.date, true);
            }
        } else if (message.command === 'setTag') {
            if (typeof message.tag === 'string') {
                await vscode.commands.executeCommand('markdown-org.setTag', message.tag);
            }
        } else if (message.command === 'cycleHeaderMode') {
            // The button in the control row writes the setting through the same
            // command the palette offers, so both routes leave the same value
            // behind; the configuration listener then reflows the open panel.
            await vscode.commands.executeCommand('markdown-org.cycleAgendaHeaderMode');
        } else if (message.command === 'switchMode') {
            const targetCommand = agendaModeCommand(message.mode);
            if (targetCommand) {
                await vscode.commands.executeCommand(targetCommand, AgendaPanel.shiftedToday);
            }
        } else if (message.command === 'openSourceFile') {
            // Same trust argument as `openTask` above: the path is one the
            // agenda itself put in the page, and attribute injection through
            // `data-file` is closed by escaping (agendaEscapeHtml.ts). Line 1
            // because a source row names a file, not a task.
            if (typeof message.file === 'string') {
                await AgendaPanel.openTaskInEditor(message.file, 1);
            }
        } else if (message.command === 'gitCommit' || message.command === 'gitPush') {
            const args = AgendaPanel.lastRenderArgs;
            if (!args) {
                return;
            }
            const { strings } = AgendaPanel.uiStrings();
            const files = agendaSourceFiles(args.data);
            if (message.command === 'gitCommit') {
                await commitAgendaSources(files, strings);
            } else {
                await pushAgendaSources(files, strings);
            }
            // The repository events that follow will refresh the chip on their
            // own; this covers the case where nothing changed (a cancelled
            // prompt) and no event is coming.
            AgendaPanel.requestGitStatus();
        } else if (message.command === 'groupAction') {
            await AgendaPanel.handleGroupAction(message.section, message.action, message.hidden);
        }
    }

    /**
     * Act on a whole band of the day card.
     *
     * The page names the band, not its tasks: the payload the view was built
     * from is here, and rebuilding the band from it keeps the file list on the
     * side that writes the files. The band is rebuilt rather than remembered
     * because the same payload and the same rule produce the same grouping the
     * user is looking at.
     *
     * `hidden` is the one part of the view the payload does not carry: the
     * directory chips are answered in the page, so the roots that are off come
     * with the message and narrow the band before it is turned into files.
     */
    private static async handleGroupAction(
        section: string | undefined,
        action: string | undefined,
        hidden: unknown
    ): Promise<void> {
        const args = AgendaPanel.lastRenderArgs;
        const bulkAction = asBulkAction(action);
        if (!args || !section || !bulkAction) {
            return;
        }
        const hiddenRoots = Array.isArray(hidden)
            ? hidden.filter((root): root is string => typeof root === 'string')
            : [];
        const { language, strings } = AgendaPanel.uiStrings();
        const targets = groupTargets(args.data, section, strings.sections, hiddenRoots);
        if (targets.length === 0) {
            return;
        }
        if (await applyGroupAction(bulkAction, targets, strings, language)) {
            // The files changed under the extractor's feet, and the watcher
            // only fires for the ones inside a scanned directory -- ask for the
            // refresh here so the band the user just emptied leaves the screen.
            AgendaPanel.requestRefresh(AgendaPanel.shiftedToday, false);
        }
    }

    private static ensureWatcher(config: vscode.WorkspaceConfiguration) {
        // Scope the watchers to the directories that the extractor actually
        // sweeps. With a bare `**/*.md` pattern, the underlying OS primitive
        // (inotify/FSEvents/etc.) registers watches for every `.md` under
        // the workspace, including node_modules / .git / .vscode-test, even
        // though triggerRefresh ignores those events. A RelativePattern with
        // a scanned directory as the base avoids setting up those watches in
        // the first place -- one pattern per directory, since a RelativePattern
        // has a single base and the directories need not share a parent.
        const bases = resolveAgendaDirectories(
            config.get<string[]>('workspaceDirs'),
            config.get<string>('workspaceDir'),
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        );
        const patterns: vscode.GlobPattern[] =
            bases.length > 0 ? bases.map((base) => new vscode.RelativePattern(base, '**/*.md')) : ['**/*.md'];
        AgendaPanel.watchers = patterns.map((pattern) => vscode.workspace.createFileSystemWatcher(pattern));

        const ignored = (uri: vscode.Uri) => {
            // Normalize backslashes to forward slashes so the same checks
            // work regardless of how `fsPath` is rendered on the current
            // platform (Windows can produce either style depending on the
            // URI source).
            const normalized = uri.fsPath.replaceAll('\\', '/');
            return (
                normalized.endsWith('.archive.md') ||
                normalized.includes('/.git/') ||
                normalized.includes('/node_modules/')
            );
        };

        const triggerRefresh = (uri: vscode.Uri) => {
            if (ignored(uri)) {
                return;
            }
            if (AgendaPanel.debounceTimer) {
                clearTimeout(AgendaPanel.debounceTimer);
            }
            AgendaPanel.debounceTimer = setTimeout(() => {
                AgendaPanel.requestRefresh();
            }, REFRESH_DEBOUNCE_MS);
        };

        AgendaPanel.watchers.forEach((watcher) => {
            watcher.onDidChange(triggerRefresh);
            watcher.onDidCreate(triggerRefresh);
            watcher.onDidDelete(triggerRefresh);
        });
    }

    /**
     * Test-only helper: ask the webview for a snapshot of the day-header
     * `data-date` attributes currently in the rendered DOM. Used by the
     * agenda integration suite to verify that renderAgenda produced the
     * expected dates for a given anchor; production code never queries
     * this. Returns null when no panel is open.
     */
    public static queryRenderedInfoForTesting(timeoutMs = 2000): Promise<{
        dayHeaders: string[];
        mode: string;
        flags: string[];
        sections: string[];
        /** Section keys that offer a group action, in document order. */
        sectionMenus: string[];
        /** Tooltip of each collection dot, in row order; empty with one directory. */
        collectionMarks: string[];
        /** Directory chips, each as its name plus ` (off)` while it is hidden. */
        collectionChips: string[];
        headerLayout: string;
        heroSharesControlRow: boolean;
        heroSub: string;
        dayNumbers: string[];
        /** Text of the git chip, or empty when the header carries none. */
        gitChip: string;
        /** Rows hidden above/below per day header, aligned with `dayHeaders`. */
        clipAbove: number[];
        clipBelow: number[];
        /** Whether today's first task row sits behind its own sticky header. */
        todayFirstRowHidden: boolean;
        /** Where the page ended up after the render decided its scroll. */
        scrollY: number;
    } | null> {
        const panel = AgendaPanel.currentPanel;
        if (!panel) {
            return Promise.resolve(null);
        }
        return new Promise((resolve, reject) => {
            const sub = panel.webview.onDidReceiveMessage(
                (m: {
                    command: string;
                    dayHeaders?: string[];
                    mode?: string;
                    flags?: string[];
                    sections?: string[];
                    sectionMenus?: string[];
                    collectionMarks?: string[];
                    collectionChips?: string[];
                    headerLayout?: string;
                    heroSharesControlRow?: boolean;
                    heroSub?: string;
                    dayNumbers?: string[];
                    gitChip?: string;
                    clipAbove?: number[];
                    clipBelow?: number[];
                    todayFirstRowHidden?: boolean;
                    scrollY?: number;
                }) => {
                    if (m.command === 'renderedInfo') {
                        clearTimeout(timer);
                        sub.dispose();
                        resolve({
                            dayHeaders: m.dayHeaders ?? [],
                            mode: m.mode ?? '',
                            flags: m.flags ?? [],
                            sections: m.sections ?? [],
                            sectionMenus: m.sectionMenus ?? [],
                            collectionMarks: m.collectionMarks ?? [],
                            collectionChips: m.collectionChips ?? [],
                            headerLayout: m.headerLayout ?? '',
                            heroSharesControlRow: m.heroSharesControlRow ?? false,
                            heroSub: m.heroSub ?? '',
                            dayNumbers: m.dayNumbers ?? [],
                            gitChip: m.gitChip ?? '',
                            clipAbove: m.clipAbove ?? [],
                            clipBelow: m.clipBelow ?? [],
                            todayFirstRowHidden: m.todayFirstRowHidden ?? false,
                            scrollY: m.scrollY ?? 0
                        });
                    }
                }
            );
            const timer = setTimeout(() => {
                sub.dispose();
                reject(new Error(`webview did not respond to getRenderedInfo within ${timeoutMs}ms`));
            }, timeoutMs);
            panel.webview.postMessage({ command: 'getRenderedInfo' });
        });
    }

    /**
     * Test-only helper: scroll the open panel to `y`.
     *
     * The week view's sticky-anchor handling and its clipping chips only differ
     * from the trivial case when the page is already scrolled, and a test
     * driving VS Code from outside has no other way to put it there. Resolves
     * to false when no panel is open. Production code never calls this.
     */
    public static setScrollForTesting(y: number): Thenable<boolean> {
        const panel = AgendaPanel.currentPanel;
        if (!panel) {
            return Promise.resolve(false);
        }
        return panel.webview.postMessage({ command: 'setScrollForTesting', y });
    }

    /**
     * Test-only helper: press the directory chip of `root` in the open panel.
     *
     * The chips live entirely in the page -- the host is never told which
     * directories are hidden, because the rows are already there and turning
     * one back on must not cost a scan. Pressing the chip is therefore the only
     * way in from outside. Resolves to false when no panel is open.
     */
    public static clickCollectionChipForTesting(root: string): Thenable<boolean> {
        const panel = AgendaPanel.currentPanel;
        if (!panel) {
            return Promise.resolve(false);
        }
        return panel.webview.postMessage({ command: 'clickCollectionChipForTesting', root });
    }

    /**
     * Test-only helper: answer the band `section` with `action` in the open
     * panel, as pressing the menu item does.
     *
     * Driving it through the page rather than calling the handler directly is
     * the point: what the message carries -- the chips that are off among the
     * rest -- is assembled there, and a test that forged the message would
     * confirm nothing about the band the reader was looking at. Resolves to
     * false when no panel is open.
     */
    public static clickGroupActionForTesting(section: string, action: string): Thenable<boolean> {
        const panel = AgendaPanel.currentPanel;
        if (!panel) {
            return Promise.resolve(false);
        }
        return panel.webview.postMessage({ command: 'clickGroupActionForTesting', section, action });
    }

    /**
     * Open a file at the given 1-based line in an editor. The path is expected
     * to be absolute (the agenda passes `--absolute-paths` to
     * `markdown-org-extract`). Failures from `openTextDocument` are surfaced
     * via `showErrorMessage` instead of being silently swallowed.
     *
     * Exposed for integration tests (see CLAUDE.md for why we do not gate
     * this path on `workspaceFolders`).
     */
    public static async openTaskInEditor(file: string, line: number): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(file);
            const pos = new vscode.Position(Math.max(0, line - 1), 0);
            await vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(pos, pos)
            });
        } catch (err) {
            notifyError(`failed to open ${file}: ${formatError(err)}`);
        }
    }

    /** Reload data into the panel without re-focusing it. Re-reads settings (including tag filter). */
    public static refresh() {
        AgendaPanel.requestRefresh(AgendaPanel.shiftedToday, false);
    }

    /** Navigate one step back through the agenda's view history (no-op at the start). */
    public static async goBack(): Promise<void> {
        const state = AgendaPanel.history.back();
        if (state) {
            await AgendaPanel.replayHistoryState(state);
        }
    }

    /** Navigate one step forward through the agenda's view history (no-op at the end). */
    public static async goForward(): Promise<void> {
        const state = AgendaPanel.history.forward();
        if (state) {
            await AgendaPanel.replayHistoryState(state);
        }
    }

    /**
     * Re-render a past view state by re-invoking the matching show command with
     * its anchor date, mirroring the segment mode-switch path (panel reuse, no
     * dispose). The replay depth is held for the duration so the re-render does
     * not re-record the state, and so overlapping replays do not uncover each
     * other.
     */
    private static async replayHistoryState(state: AgendaViewState): Promise<void> {
        const command = agendaModeCommand(state.mode);
        if (!command) {
            return;
        }
        AgendaPanel.historyReplayDepth += 1;
        try {
            await vscode.commands.executeCommand(command, state.date);
        } finally {
            AgendaPanel.historyReplayDepth -= 1;
        }
    }

    /**
     * The pure helpers whose source is inlined into the page next to the client.
     *
     * They are emitted as top-level function declarations and then handed to
     * `agendaClientMain` by name, so the ones that call each other (e.g.
     * `resolveTaskClickIntent` calling `isMeaningfulSelection`) still resolve
     * through the page's global scope. Each is unit-tested in `src/test/unit/`,
     * which is what transitively covers the webview behaviour.
     *
     * `satisfies AgendaClientDeps` is the load-bearing part: it type-checks these
     * real functions against the contract the client is written against, so a
     * changed signature fails the build instead of the page. The keys double as
     * the names emitted into the page, hence the shorthand spelling.
     */
    private static readonly INLINED_HELPERS = {
        isMeaningfulSelection,
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
        countLabel,
        summaryStat,
        renderSummaryBar,
        renderSectionPanel,
        renderGroupMenu,
        renderDayHeaderHtml,
        renderModeSwitch,
        tagLabel,
        tagButtonText,
        renderTagMenu,
        renderHeaderModeButton,
        renderDateNav,
        renderHeroHtml,
        renderNavBarHtml,
        buildMonthGrid,
        resolveFirstDayOffset,
        buildWeekdayLabels,
        calendarCellOpenTag,
        renderMonthCalendar,
        renderTaskRow,
        collectionMarkHtml,
        hideCollections,
        renderCollectionChips,
        taskDateDirection,
        renderCard,
        // The git chip's markup, split the way the rest of the header is: the
        // exported helpers are what the inlined bodies call, and a function
        // that is not listed here is simply not defined in the page.
        gitCount,
        gitChipStats,
        gitChipTitle,
        renderGitChip,
        gitUnpushedGroupTitle,
        gitFileRows,
        gitFilesByRepository,
        gitGroup,
        gitGroups,
        gitActions,
        renderGitMenu
    } satisfies AgendaClientDeps;

    /**
     * The `<script>` body: every inlined helper, then a call into the client
     * with the bootstrap dictionary and those same helpers.
     *
     * `<` is escaped inside the JSON literal so no dictionary string can
     * terminate the enclosing `<script>` block.
     */
    private static webviewScript(): string {
        const helpers = Object.values(AgendaPanel.INLINED_HELPERS)
            .map((fn) => fn.toString())
            .join('\n\n');
        const depsLiteral = '{ ' + Object.keys(AgendaPanel.INLINED_HELPERS).join(', ') + ' }';
        const boot: AgendaClientBootstrap = AgendaPanel.uiStrings();
        const bootLiteral = JSON.stringify(boot).replaceAll('<', '\\u003c');
        return `${helpers}\n\n(${agendaClientMain.toString()})(${bootLiteral}, ${depsLiteral});`;
    }

    // The webview shell only needs the CSP nonce and source; the agenda state
    // (data/mode/locale/tag/holidays) is delivered separately via the 'init'
    // postMessage, so it is not threaded through the HTML.
    private static getHtmlContent(nonce: string, cspSource: string): string {
        // The setting lands inside a CSS declaration, so it is validated rather
        // than trimmed: sanitizeFontFamily returns '' both for "not set" and for
        // anything that is not a plain font stack, and both fall back to the
        // built-in default. Unit-tested in agendaFontFamily.test.ts.
        const agendaFont = AgendaPanel.agendaFontStack();
        return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        /* Font families come in through a nonce'd <style> block, NOT an inline
           style="" attribute on <body>: the CSP (style-src with a nonce, no
           'unsafe-inline') blocks inline style attributes, so a custom property
           set there never applies and font-family: var(...) falls back to the
           browser default serif. A nonce'd rule is allowed and does apply. */
        :root {
            --markdown-org-agenda-font: ${agendaFont};
        }
        ${AGENDA_STYLES}
    </style>
</head>
<body>
    <div class="agenda-header" id="agenda-header">
        <div class="agenda-hero" id="current-date"></div>
        <div class="nav-bar" id="nav-bar"></div>
        <div id="collection-row"></div>
    </div>
    <div id="content"></div>
    <script nonce="${nonce}">
${AgendaPanel.webviewScript()}
    </script>
</body>
</html>`;
    }
}
