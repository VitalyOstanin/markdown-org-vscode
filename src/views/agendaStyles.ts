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
            /* 3-column day header (see formatDayHeader): weekday | day | month+year. */
            grid-template-columns: 120px 30px 1fr;
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
            font-family: 'Courier New', monospace;
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
            grid-template-columns: auto auto 1fr 90px;
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
            font-family: 'Courier New', ui-monospace, monospace;
            font-variant-numeric: tabular-nums;
        }
    `;
