/**
 * Static CSS for the agenda webview, kept vscode-free so a unit test can
 * assert two invariants:
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
 * nonce lives on the tag, these rules are static.
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
            font-family: 'Courier New', monospace;
            padding: var(--space-5);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            /* Base size for the em-scale below: the webview's own font size. */
            font-size: var(--vscode-font-size);
            line-height: 1.6;
        }
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
               When adding/removing a column, update renderTask in lockstep — the grid does not
               span-collapse, so a missing span shifts every column right of it. */
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
        .todo-keyword { color: var(--vscode-charts-red); font-weight: bold; }
        .done-keyword { color: var(--vscode-charts-green); font-weight: bold; }
        .priority-a { color: var(--vscode-charts-red); font-weight: bold; }
        .priority-b { color: var(--vscode-charts-yellow); font-weight: bold; }
        .priority-c { color: var(--vscode-charts-blue); font-weight: bold; }
        /* Heading tint by priority -- same hue AND weight as the marker
           (full font match). Loses to .deadline-heading (DEADLINE wins
           by design -- it's the louder signal). */
        .heading-priority-a { color: var(--vscode-charts-red); font-weight: bold; }
        .heading-priority-b { color: var(--vscode-charts-yellow); font-weight: bold; }
        .heading-priority-c { color: var(--vscode-charts-blue); font-weight: bold; }
        .time-display { color: var(--vscode-textLink-foreground); font-weight: bold; }
        .timestamp-type { font-weight: bold; }
        .timestamp-deadline { color: var(--vscode-charts-red); font-weight: bold; }
        .date-overdue { color: var(--vscode-descriptionForeground); text-align: right; }
        .date-upcoming { color: var(--vscode-textLink-foreground); text-align: right; font-weight: bold; }
        .deadline-heading { color: var(--vscode-charts-red); font-weight: bold; }
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
    `;
