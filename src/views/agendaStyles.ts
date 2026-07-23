/**
 * Static CSS for the agenda webview, kept vscode-free so a unit test can
 * assert invariants across all three visual-style presets (monospace /
 * native / hybrid, selected via `body[data-agenda-style]`):
 *
 *  - Theming (#11): every colour resolves through a `var(--vscode-*)` token
 *    (or a `color-mix()` of them) with no hardcoded HEX, so the panel follows
 *    the active VS Code theme -- light, dark, or high contrast.
 *  - Spacing scale (#20): all padding/margin/gap come from a single
 *    4/8/12/16/20 token scale (`--space-1..5`, declared once in `:root`), and
 *    font-size is expressed in one unit (em, relative to the webview's own
 *    `var(--vscode-font-size)`). Fixed grid-column widths, the indicator dot
 *    size and border widths are markup sizes and stay in px.
 *
 * Injected by `AgendaPanel.getHtmlContent` inside a nonce'd `<style>` tag; the
 * nonce lives on the tag, these rules are static. The DOM emitted by
 * `renderTask` is identical across presets (`.task-line[data-status]
 * [data-priority][data-type]` with `.status`/`.priority`/`.heading`/`.offset`
 * children) -- everything that differs between monospace, native and hybrid
 * (the `[#A]` brackets, badge pills, column widths) lives entirely here.
 */
export const AGENDA_STYLES = `
        :root {
            /* Spacing scale (#20): the only place these step values live as
               literals -- every padding/margin/gap below references a token. */
            --space-1: 4px;
            --space-2: 8px;
            --space-3: 12px;
            --space-4: 16px;
            --space-5: 20px;
        }
        body {
            padding: var(--space-5);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            /* Base size for the em-scale below: the webview's own font size. */
            font-size: var(--vscode-font-size);
            line-height: 1.6;
        }
        /* ---- common structure (all presets) ---- */
        .nav-bar {
            display: flex;
            gap: var(--space-2);
            margin-bottom: var(--space-5);
            align-items: center;
        }
        .nav-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: var(--space-2) var(--space-3);
            cursor: pointer;
            font-family: inherit;
            font-size: 1.05em;
        }
        .nav-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .mode-switch {
            display: inline-flex;
            margin-right: var(--space-2);
        }
        .mode-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-panel-border);
            padding: var(--space-1) var(--space-2);
            cursor: pointer;
            font-family: inherit;
            font-size: 1em;
        }
        .mode-btn + .mode-btn {
            border-left: none;
        }
        .mode-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .mode-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
            font-weight: bold;
        }
        .current-date {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
            font-size: 1.05em;
            margin: var(--space-1) 0 var(--space-4) 0;
        }
        .tag-indicator {
            color: var(--vscode-charts-yellow);
            font-weight: bold;
            margin-left: auto;
            cursor: pointer;
        }
        .tag-indicator:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        .style-menu {
            position: relative;
        }
        .style-menu-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-panel-border);
            padding: var(--space-1) var(--space-2);
            cursor: pointer;
            font-family: inherit;
            font-size: 1em;
        }
        .style-menu-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .style-menu-list {
            position: absolute;
            right: 0;
            top: 100%;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            z-index: 10;
            display: none;
            min-width: 120px;
        }
        .style-menu.open .style-menu-list {
            display: block;
        }
        .style-menu-item {
            padding: var(--space-1) var(--space-3);
            cursor: pointer;
            color: var(--vscode-foreground);
        }
        .style-menu-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .style-menu-item.active {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
        }
        .day-header {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
            margin: var(--space-5) 0 var(--space-1) 0;
            display: grid;
            /* 3-column day header (see formatDayHeader): weekday | day | month+year.
               Content-sized columns keep the parts tight together -- fixed widths
               left large gaps after short weekdays (e.g. "среда"). */
            grid-template-columns: max-content max-content 1fr;
            column-gap: 1ch;
        }
        .task-line {
            display: grid;
            /* 6-column task line (see renderTask): todo: | time | status | priority | heading | date.
               When adding/removing a column, update renderTask in lockstep -- the grid does not
               span-collapse, so a missing span shifts every column right of it. Per-preset column
               widths are overridden below (monospace keeps this default). */
            grid-template-columns: auto 140px 60px 60px 1fr 90px;
            gap: var(--space-2);
            margin: var(--space-1) 0;
            cursor: pointer;
            font-size: 1.1em;
        }
        .task-line:hover {
            background: var(--vscode-list-hoverBackground);
        }
        /* timeInfo cell -- forced vertical stack so a SCHEDULED time and
           a DEADLINE marker always render as two stacked lines, regardless
           of font width. This replaced an older "DEADLINE ⌃" caret that
           relied on CSS wrap inside a fixed-width cell and broke on narrow
           monospace fonts (caret pointed at unrelated content above). */
        .time-info-cell {
            display: flex;
            flex-direction: column;
            line-height: 1.2;
        }
        /* .flag holds the table-only type glyph; hidden (and thus out of the
           grid) in every preset except table, so their column counts are
           unaffected by the extra renderTask cell. */
        .flag { display: none; }
        /* .time-plain is the table-only clean HH:MM cell; hidden (out of the
           grid) in every other preset so their column counts are unaffected. */
        .time-plain { display: none; }
        .todo-label { color: var(--vscode-charts-red); }
        .status[data-status="todo"] { color: var(--vscode-charts-red); font-weight: bold; }
        .status[data-status="done"] { color: var(--vscode-charts-green); font-weight: bold; }
        .status[data-status="cancelled"] { color: var(--vscode-disabledForeground); text-decoration: line-through; font-weight: bold; }
        .priority[data-priority="a"] { color: var(--vscode-charts-red); font-weight: bold; }
        .priority[data-priority="b"] { color: var(--vscode-charts-yellow); font-weight: bold; }
        .priority[data-priority="c"] { color: var(--vscode-charts-blue); font-weight: bold; }
        /* Heading tint by priority -- same hue AND weight as the marker
           (full font match). Loses to [data-type="deadline"] (DEADLINE wins
           by design -- it's the louder signal). */
        .task-line[data-priority="a"] .heading { color: var(--vscode-charts-red); font-weight: bold; }
        .task-line[data-priority="b"] .heading { color: var(--vscode-charts-yellow); font-weight: bold; }
        .task-line[data-priority="c"] .heading { color: var(--vscode-charts-blue); font-weight: bold; }
        .task-line[data-type="deadline"] .heading { color: var(--vscode-charts-red); font-weight: bold; }
        .offset[data-dir="overdue"] { color: var(--vscode-descriptionForeground); text-align: right; }
        .offset[data-dir="upcoming"] { color: var(--vscode-textLink-foreground); text-align: right; font-weight: bold; }
        .calendar {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: var(--space-1);
            margin: var(--space-5) 0;
            max-width: 800px;
        }
        .calendar-header {
            text-align: center;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            padding: var(--space-2);
            background: var(--vscode-editorWidget-background);
        }
        .calendar-day {
            aspect-ratio: 1;
            border: 1px solid var(--vscode-panel-border);
            padding: var(--space-2);
            cursor: pointer;
            background: var(--vscode-editorWidget-background);
            position: relative;
        }
        /* weekend/holiday/today are subtle background tints with no exact theme
           token, so they are mixed from a semantic colour over the day's base
           background -- this tracks the active theme instead of a fixed hue. */
        .calendar-day.weekend {
            background: color-mix(in srgb, var(--vscode-foreground) 8%, var(--vscode-editorWidget-background));
        }
        .calendar-day.holiday {
            background: color-mix(in srgb, var(--vscode-charts-red) 14%, var(--vscode-editorWidget-background));
        }
        .calendar-day.has-tasks {
            border-color: var(--vscode-focusBorder);
            font-weight: bold;
        }
        .calendar-day.today {
            border: 2px solid var(--vscode-focusBorder);
            background: color-mix(in srgb, var(--vscode-charts-blue) 18%, var(--vscode-editor-background));
        }
        .calendar-day.other-month {
            opacity: 0.3;
        }
        .day-number {
            font-size: 1.05em;
        }
        .task-indicator {
            position: absolute;
            bottom: var(--space-1);
            right: var(--space-1);
            width: 6px;
            height: 6px;
            background: var(--vscode-charts-blue);
            border-radius: 50%;
        }
        /* ============ preset: monospace (reproduces the pre-#/style-menu look) ============ */
        body[data-agenda-style="monospace"] {
            font-family: var(--markdown-org-agenda-mono-font);
        }
        [data-agenda-style="monospace"] .priority[data-priority="a"]::before,
        [data-agenda-style="monospace"] .priority[data-priority="b"]::before,
        [data-agenda-style="monospace"] .priority[data-priority="c"]::before {
            content: "[#";
        }
        [data-agenda-style="monospace"] .priority[data-priority="a"]::after,
        [data-agenda-style="monospace"] .priority[data-priority="b"]::after,
        [data-agenda-style="monospace"] .priority[data-priority="c"]::after {
            content: "]";
        }
        /* ============ preset: native ============ */
        body[data-agenda-style="native"] {
            font-family: var(--markdown-org-agenda-font);
        }
        body[data-agenda-style="native"] .task-line {
            grid-template-columns: auto auto auto 1fr auto;
            align-items: center;
        }
        body[data-agenda-style="native"] .todo-label {
            display: none;
        }
        body[data-agenda-style="native"] .status {
            font-size: 0.72em;
            font-weight: 700;
            padding: 0 var(--space-2);
            border-radius: 10px;
            text-align: center;
        }
        body[data-agenda-style="native"] .status[data-status="todo"] {
            background: color-mix(in srgb, var(--vscode-charts-red) 16%, transparent);
        }
        body[data-agenda-style="native"] .status[data-status="done"] {
            background: color-mix(in srgb, var(--vscode-charts-green) 16%, transparent);
        }
        body[data-agenda-style="native"] .priority {
            font-size: 0.8em;
            width: 1.4em;
            text-align: center;
            border-radius: 3px;
            color: var(--vscode-editor-background);
        }
        body[data-agenda-style="native"] .priority[data-priority="a"] { background: var(--vscode-charts-red); }
        body[data-agenda-style="native"] .priority[data-priority="b"] { background: var(--vscode-charts-yellow); }
        body[data-agenda-style="native"] .priority[data-priority="c"] { background: var(--vscode-charts-blue); }
        body[data-agenda-style="native"] .priority:empty {
            visibility: hidden;
        }
        /* ============ preset: hybrid (default) ============ */
        body[data-agenda-style="hybrid"] {
            font-family: var(--markdown-org-agenda-font);
        }
        body[data-agenda-style="hybrid"] .task-line {
            grid-template-columns: auto 64px 1.6em 1fr 56px;
            align-items: center;
        }
        body[data-agenda-style="hybrid"] .todo-label {
            display: none;
        }
        body[data-agenda-style="hybrid"] .status {
            font-size: 0.72em;
            font-weight: 700;
            padding: 0 var(--space-2);
            border-radius: 10px;
            text-align: center;
        }
        body[data-agenda-style="hybrid"] .status[data-status="todo"] {
            background: color-mix(in srgb, var(--vscode-charts-red) 16%, transparent);
        }
        body[data-agenda-style="hybrid"] .status[data-status="done"] {
            background: color-mix(in srgb, var(--vscode-charts-green) 16%, transparent);
        }
        body[data-agenda-style="hybrid"] .priority {
            font-size: 0.8em;
            width: 1.4em;
            text-align: center;
            border-radius: 3px;
            color: var(--vscode-editor-background);
        }
        body[data-agenda-style="hybrid"] .priority[data-priority="a"] { background: var(--vscode-charts-red); }
        body[data-agenda-style="hybrid"] .priority[data-priority="b"] { background: var(--vscode-charts-yellow); }
        body[data-agenda-style="hybrid"] .priority[data-priority="c"] { background: var(--vscode-charts-blue); }
        body[data-agenda-style="hybrid"] .priority:empty {
            visibility: hidden;
        }
        body[data-agenda-style="hybrid"] .time-info-cell,
        body[data-agenda-style="hybrid"] .offset {
            font-family: var(--markdown-org-agenda-mono-font);
            font-variant-numeric: tabular-nums;
        }
        /* ============ preset: table (D2+) ============ */
        body[data-agenda-style="table"] {
            font-family: var(--markdown-org-agenda-font);
        }
        /* markdown-org.agendaTableAllMono: render every table element in the
           monospace family, not just the time/offset numerics. */
        body[data-agenda-style="table"][data-table-mono="true"] {
            font-family: var(--markdown-org-agenda-mono-font);
        }
        /* Table day header (per mockup): blue dot + weekday in blue, a muted
           date, and a thin rule underneath. The day-of-week arrows that mark
           "today" in the other presets are hidden here. */
        body[data-agenda-style="table"] .day-header {
            display: flex;
            align-items: baseline;
            gap: var(--space-2);
            margin: var(--space-5) 0 var(--space-2) 0;
            padding-bottom: var(--space-1);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: normal;
        }
        body[data-agenda-style="table"] .day-header .day-weekday {
            /* Day-of-week: only slightly larger than the body text, saturated
               blue and bold (smaller than the mockup's 1.15em). */
            font-size: 1.05em;
            font-weight: 700;
            /* ru locale lowercases weekday names ("понедельник"); the mockup
               capitalises the first letter. */
            text-transform: capitalize;
            color: color-mix(in srgb, var(--vscode-charts-blue) 82%, var(--vscode-editor-foreground) 18%);
        }
        body[data-agenda-style="table"] .day-header .day-weekday::before {
            content: "";
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-charts-blue);
            vertical-align: middle;
            margin-right: var(--space-2);
        }
        body[data-agenda-style="table"] .day-header .day-num,
        body[data-agenda-style="table"] .day-header .day-rest {
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
        }
        body[data-agenda-style="table"] .day-nav { display: none; }
        body[data-agenda-style="table"] .task-line {
            /* dot | big time | flag | priority | heading | offset.
               Offset is auto-sized (not the mockup's fixed 52px, which fit its
               short "-2д"): the real column shows a full DD.MM.YYYY date, so a
               fixed width overflowed it past the grid edge and forced a
               horizontal scrollbar. auto sizes it to the date; the 1fr heading
               absorbs the rest. */
            grid-template-columns: 14px 56px 18px 18px 1fr auto;
            align-items: center;
            /* Table runs at the base font size (mockup's 13px), not the 1.1em
               the other presets use -- keeps the row compact and makes the
               1.23em time resolve to the mockup's 16px. */
            font-size: 1em;
        }
        body[data-agenda-style="table"] .todo-label { display: none; }
        /* Visual order (DOM order stays shared across presets): dot first. */
        body[data-agenda-style="table"] .status { order: 1; }
        body[data-agenda-style="table"] .time-plain { order: 2; }
        body[data-agenda-style="table"] .flag { order: 3; }
        body[data-agenda-style="table"] .priority { order: 4; }
        body[data-agenda-style="table"] .heading { order: 5; }
        body[data-agenda-style="table"] .offset { order: 6; }
        /* status rendered as a coloured dot, not text */
        body[data-agenda-style="table"] .status {
            font-size: 0;
            justify-self: center;
        }
        /* Status dot colour = attention level (resolveAttentionLevel):
           danger (red) for a DEADLINE or any overdue task, done (green),
           cancelled (grey), else normal (blue -- today or future). The base
           rule paints the normal case; the others override by data-attention. */
        body[data-agenda-style="table"] .status::before {
            content: "";
            display: block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: color-mix(in srgb, var(--vscode-charts-blue) 65%, var(--vscode-editor-foreground) 35%);
        }
        body[data-agenda-style="table"] .status[data-attention="danger"]::before { background: color-mix(in srgb, var(--vscode-charts-red) 72%, var(--vscode-editor-foreground) 28%); }
        body[data-agenda-style="table"] .status[data-attention="done"]::before { background: var(--vscode-charts-green); }
        body[data-agenda-style="table"] .status[data-attention="cancelled"]::before { background: var(--vscode-disabledForeground); }
        /* big time: table uses the clean .time-plain (HH:MM only) and hides
           the buildTimeInfo cell, whose dot-trails / stacked DEADLINE label /
           relative "Sched.Nx" text would break the single-line grid. */
        body[data-agenda-style="table"] .time-info-cell { display: none; }
        body[data-agenda-style="table"] .time-plain {
            display: block;
            /* mockup renders the time in the same sans as the rest (not mono);
               tabular-nums keeps the digits column-aligned. */
            font-family: var(--markdown-org-agenda-font);
            font-variant-numeric: tabular-nums;
            /* Time sits at the heading size (not the mockup's larger 1.23em);
               it stands out by weight and the blue colour alone. */
            font-size: 1em;
            font-weight: 600;
            text-align: right;
            /* Softer, lighter blue than raw charts-blue -- matches the muted
               accent in the mockup -- by blending the theme accent toward the
               foreground. */
            color: color-mix(in srgb, var(--vscode-charts-blue) 65%, var(--vscode-editor-foreground) 35%);
        }
        /* time column shows an em-dash placeholder when a task has no clock
           time, so the big-time column never collapses to blank (per mockup). */
        body[data-agenda-style="table"] .time-plain:empty::before {
            content: "—";
            color: var(--vscode-disabledForeground);
            font-weight: normal;
        }
        /* flag column */
        body[data-agenda-style="table"] .flag {
            display: block;
            text-align: center;
        }
        /* Flag colours match the mockup's muted palette (deadline red, the same
           softened blue as the time, an amber repeat) by blending each theme
           accent toward the foreground; cancelled stays the theme's muted grey. */
        body[data-agenda-style="table"] .flag[data-flag="deadline"]::before { content: "⚑"; color: color-mix(in srgb, var(--vscode-charts-red) 72%, var(--vscode-editor-foreground) 28%); }
        body[data-agenda-style="table"] .flag[data-flag="scheduled"]::before { content: "◷"; color: color-mix(in srgb, var(--vscode-charts-blue) 65%, var(--vscode-editor-foreground) 35%); }
        body[data-agenda-style="table"] .flag[data-flag="repeat"]::before { content: "↻"; color: color-mix(in srgb, var(--vscode-charts-yellow) 78%, var(--vscode-editor-foreground) 22%); }
        body[data-agenda-style="table"] .flag[data-flag="cancelled"]::before { content: "⊘"; color: var(--vscode-disabledForeground); }
        /* priority chip (mirrors hybrid) */
        body[data-agenda-style="table"] .priority {
            font-size: 0.8em;
            width: 1.4em;
            text-align: center;
            border-radius: 3px;
            color: var(--vscode-editor-background);
        }
        body[data-agenda-style="table"] .priority[data-priority="a"] { background: color-mix(in srgb, var(--vscode-charts-red) 72%, var(--vscode-editor-foreground) 28%); }
        body[data-agenda-style="table"] .priority[data-priority="b"] { background: color-mix(in srgb, var(--vscode-charts-yellow) 78%, var(--vscode-editor-foreground) 22%); }
        body[data-agenda-style="table"] .priority[data-priority="c"] { background: color-mix(in srgb, var(--vscode-charts-blue) 65%, var(--vscode-editor-foreground) 35%); }
        body[data-agenda-style="table"] .priority:empty { visibility: hidden; }
        body[data-agenda-style="table"] .offset {
            font-family: var(--markdown-org-agenda-font);
            font-variant-numeric: tabular-nums;
        }
        /* Table headings stay neutral and regular: colour lives in the flag,
           the priority chip and the offset -- not the heading (per the mockup).
           Overrides the priority/deadline heading tint+bold from the shared
           block; higher specificity than those .task-line[...] .heading rules. */
        body[data-agenda-style="table"] .task-line .heading {
            color: var(--vscode-editor-foreground);
            font-weight: normal;
        }
        body[data-agenda-style="table"] .task-line[data-status="done"] .heading,
        body[data-agenda-style="table"] .task-line[data-status="cancelled"] .heading {
            color: var(--vscode-disabledForeground);
            text-decoration: line-through;
        }
    `;
